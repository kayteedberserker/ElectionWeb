// app/api/audit/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai'; // NEW IMPORT

// Initialize Supabase Client using high-privilege Service Role Key to bypass RLS on backend writes
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Initialize Gemini AI Client using your env key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

/**
 * Helper function to format base64 data for the Gemini multimodal API
 */
function fileToGenerativePart(base64Str, mimeType) {
    return {
        inlineData: {
            data: base64Str,
            mimeType: mimeType
        },
    };
}

/**
 * POST /api/audit
 * Receives base64 image payload from Expo, processes it with Gemini Vision, saves to Supabase Storage & DB
 */
export async function POST(request) {
    try {
        // Parse the incoming JSON body from the request
        const body = await request.json();
        const { image, agentId, puId, latitude, longitude, forceOverride } = body;

        // 1. Fail fast on missing payloads
        if (!image) {
            return NextResponse.json(
                { success: false, error: 'Missing image payload' },
                { status: 400 }
            );
        }

        if (!agentId || !puId) {
            return NextResponse.json(
                { success: false, error: 'Missing Agent ID or PU ID' },
                { status: 400 }
            );
        }

        // --- NEW CHECK 1: PREVENT DUPLICATE AGENT UPLOADS ---
        // Check if this specific agent has already uploaded for this specific polling unit
        const { data: existingUpload, error: checkError } = await supabase
            .from('document_audits')
            .select('id')
            .eq('agent_id', agentId)
            .eq('pu_id', puId)
            .maybeSingle();

        if (existingUpload) {
            return NextResponse.json(
                { success: false, error: 'You have already uploaded a results sheet for this polling unit.' },
                { status: 409 } // 409 Conflict
            );
        }
        // --------------------------------------------------

        console.log(`Processing scan from Agent: ${agentId || 'Unknown'} for PU: ${puId || 'Unknown'} at Position [Lat: ${latitude}, Lon: ${longitude}]`);

        // 2. Convert base64 image string into a binary Buffer for Supabase Storage storage
        const imageBuffer = Buffer.from(image, 'base64');
        const fileName = `${agentId || 'anon'}_${Date.now()}.jpg`;
        const filePath = `scans/${fileName}`;

        // 3. Upload raw binary file straight to the Supabase Storage bucket
        const { data: storageData, error: storageError } = await supabase.storage
            .from('document-scans')
            .upload(filePath, imageBuffer, {
                contentType: 'image/jpeg',
                upsert: true
            });

        if (storageError) {
            console.error('Supabase Storage Error:', storageError);
            return NextResponse.json(
                { success: false, error: 'Failed to upload document file to cloud storage.' },
                { status: 500 }
            );
        }

        // 4. Resolve the public read URL for the newly uploaded image asset
        const { data: { publicUrl } } = supabase.storage
            .from('document-scans')
            .getPublicUrl(filePath);


        // 5. LIVE AI VISION LAYER WITH GEMINI
        let aiData = {
            pu_code: "UNKNOWN",
            pu_name: "UNKNOWN",
            results: { APC: 0, PDP: 0, LP: 0, NNPP: 0 }
        };

        try {
            // Select the specialized multimodal/vision model
            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                // Force the model engine to output valid, clean JSON directly
                generationConfig: { responseMimeType: "application/json" }
            });

            const imagePart = fileToGenerativePart(image, "image/jpeg");

            const prompt = `
                Analyze this official election results sheet image carefully.
                1. Extract the Polling Unit Code (look for fields labeled 'Polling Unit Code', 'PU Code', or patterns like XX-XX-XX-XXX).
                1. Extract the Polling Unit Name (look for fields labeled 'Polling Unit/ Polling Unit Name', 'PU Name'.
                2. Dynamically look at the results table and extract the final written vote scores or figures for ALL political parties listed on the sheet that have received votes (e.g., APC, PDP, LP, NNPP, APGA, SDP, ADC, etc.).
                
                You must return the data strictly matching this JSON structure:
                {
                    "pu_code": "STRING_VALUE",
                    "pu_name": "STRING_VALUE",
                    "results": {
                        "PARTY_ACRONYM_1": NUMBER_VALUE,
                        "PARTY_ACRONYM_2": NUMBER_VALUE
                    }
                }
                
                Rules:
                - The "results" object must dynamically contain key-value pairs where the key is the capitalized acronym of the political party found on the sheet, and the value is their extracted integer score.
                - Extract integers only for the results scores.
                - Only include parties that have legible numeric scores greater than 0 to optimize the payload, or include them if explicitly listed with a valid score.
                - If the polling unit name is completely missing or illegible, set "pu_name" to "UNKNOWN".
                - If the polling unit code is completely missing or illegible, set "pu_code" to "UNKNOWN".
                - Do not include markdown wraps, code block backticks, or prose outside of the raw JSON object structure.
            `;

            const aiResponse = await model.generateContent([prompt, imagePart]);
            const responseText = aiResponse.response.text();

            // Safely parse the structured response straight into our template object
            aiData = JSON.parse(responseText);

        } catch (geminiError) {
            console.error('Gemini Vision processing failed:', geminiError);
            // Fallback to prevent complete system crash if API times out or fails validation
            aiData.pu_code = "PARSE_ERROR";
        }

        // --- NEW CHECK 2: AI MISMATCH VALIDATION ---
        // Assuming puId from the frontend is the actual text code (e.g. '12-34-56-789')
        if (aiData.pu_code !== "UNKNOWN" && aiData.pu_code !== "PARSE_ERROR" && puId) {
            // Clean up strings to prevent silly mismatch errors (remove spaces, match casing)
            const cleanAiCode = aiData.pu_code.replace(/\s+/g, '').toUpperCase();
            const cleanPuId = puId.replace(/\s+/g, '').toUpperCase();

            if (cleanAiCode !== cleanPuId && !forceOverride) {
                // Delete the uploaded file to save storage since we are rejecting it
                await supabase.storage.from('document-scans').remove([filePath]);

                return NextResponse.json({
                    success: false,
                    error: 'AI Code Mismatch',
                    message: `The AI read the code as [${aiData.pu_code}], but you are submitting for [${puId}]. Please verify the sheet.`,
                    needsForceOverride: true // Tells the frontend to show a confirmation dialog
                }, { status: 406 }); // 406 Not Acceptable
            }
        }
        // -----------------------------------------

        // 6. Persist the metadata and structured analysis straight into the PostgreSQL database
        const { data: dbData, error: dbError } = await supabase
            .from('document_audits')
            .insert([
                {
                    agent_id: agentId || 'UNVERIFIED',
                    pu_id: puId || 'UNVERIFIED',
                    pu_code: aiData.pu_code || 'UNKNOWN',
                    image_url: publicUrl,
                    results: aiData.results || { APC: 0, PDP: 0, LP: 0, NNPP: 0 },
                    latitude: latitude ? parseFloat(latitude) : null,
                    longitude: longitude ? parseFloat(longitude) : null,
                    // Optional: You could track if this was forced through despite a mismatch
                    // is_flagged: forceOverride ? true : false 
                }
            ])
            .select()
            .single();

        if (dbError) {
            console.error('Supabase Database Insert Error:', dbError);
            return NextResponse.json(
                { success: false, error: 'Database write operation failed.' },
                { status: 500 }
            );
        }

        // 7. Dispatch precise data signature back to your Expo frontend instance
        return NextResponse.json({
            success: true,
            data: {
                id: dbData.id,
                pu_code: dbData.pu_code,
                pu_name: aiData.pu_name,
                results: dbData.results,
                imageUrl: dbData.image_url,
                createdAt: dbData.created_at,
                latitude: dbData.latitude,
                longitude: dbData.longitude
            }
        }, { status: 200 });

    } catch (error) {
        console.error('Global Audit Route Exception:', error.message);
        return NextResponse.json({
            success: false,
            error: 'Internal server error processing document transaction.',
            details: error.message
        }, { status: 500 });
    }
}