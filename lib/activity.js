/**
 * Shared System Activity Logging Utility
 * Inserts system activity logs directly into Supabase public table.
 */
export async function logDeploymentActivity(supabaseClient, {
    stateName,
    lgaName = null,
    wardName = null,
    eventType = 'REGISTRATION',
    description
}) {
    if (!supabaseClient) return { error: 'No active database client provided.' };
    if (!stateName || !description) return { error: 'Missing required validation logging context.' };

    try {
        const { data, error } = await supabaseClient
            .from('deployment_activity_logs')
            .insert([{
                state_name: stateName,
                lga_name: lgaName,
                ward_name: wardName,
                event_type: eventType,
                description: description
            }])
            .select();

        if (error) throw error;
        return { success: true, data };
    } catch (err) {
        console.error('Failed to commit tracking log entry:', err);
        return { success: false, error: err.message };
    }
}