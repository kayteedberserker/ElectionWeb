'use client';

import React, { useState, useEffect, useTransition, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import LoadingOverlay from '../../../../components/LoadingOverlay';

export default function ElectoralResultsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  // Lightbox Modal UI state for viewing secure verification images
  const [activeLightboxUrl, setActiveLightboxUrl] = useState(null);

  // User context data metrics
  const [userScope, setUserScope] = useState({
    role: '',
    state: '',
    lga: '',
    ward: '',
    senatorialDistrict: '',
    federalConstituency: '',
    stateConstituency: ''
  });

  // Hierarchical Tree Structural States
  const [expandedLgas, setExpandedLgas] = useState({});
  const [expandedWards, setExpandedWards] = useState({});

  // Data Repository Cache Arrays
  const [lgas, setLgas] = useState([]);
  const [rootWards, setRootWards] = useState([]); // Dynamic root level for sub-LGA fallback arrays
  const [wardsData, setWardsData] = useState({}); // Keyed by lgaName
  const [puData, setPuData] = useState({});       // Keyed by wardName

  // LIVE DATABASE PERSONNEL REGISTRY
  const [campaignPersonnel, setCampaignPersonnel] = useState([]);

  // LIVE DATABASE RESULTS REGISTRY
  const [documentAudits, setDocumentAudits] = useState([]);
  const [cumulativeTotals, setCumulativeTotals] = useState({});

  // Background Worker Cache Trackers to prevent network choking
  const fetchedLgasRef = useRef(new Set());
  const fetchedWardsRef = useRef(new Set());

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const supabase = typeof window !== 'undefined'
    ? createBrowserClient(supabaseUrl, supabaseKey)
    : null;

  useEffect(() => {
    async function loadResultsDashboardRoot() {
      if (!supabase) return;
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
          setError('Failed to authenticate session scope context.');
          return;
        }

        const metadata = user.user_metadata || {};
        const seat = metadata.contesting_seat || '';
        const stateName = metadata.assigned_state || '';
        let lgaName = metadata.assigned_lga || '';
        const senatorialDistrict = metadata.senatorial_district || '';
        const federalConstituency = metadata.federal_constituency || '';
        const stateConstituency = metadata.state_constituency || '';

        // If State House of Assembly is chosen, cross-reference the client-side database mapping to find its structural LGA match
        if (seat === 'house_of_assembly' && stateName && stateConstituency && !lgaName) {
          try {
            const res = await fetch(`/api/locations?state=${encodeURIComponent(stateName)}`);
            if (res.ok) {
              const data = await res.json();
              const matchedAssembly = (data.state_constituencies || []).find(
                item => item.name?.toUpperCase() === stateConstituency.toUpperCase()
              );
              if (matchedAssembly && matchedAssembly.lga) {
                lgaName = matchedAssembly.lga;
              }
            }
          } catch (err) {
            console.error("Error resolving State Assembly structural LGA boundaries:", err);
          }
        }

        const currentScope = {
          role: seat,
          state: stateName,
          lga: lgaName,
          ward: metadata.assigned_ward || '',
          senatorialDistrict: senatorialDistrict,
          federalConstituency: federalConstituency,
          stateConstituency: stateConstituency
        };

        setUserScope(currentScope);

        // DIRECT DATABASE PERSONNEL HYDRATION
        // Pull all assigned supervisors and agents tied to this candidate id
        const { data: personnelData, error: personnelError } = await supabase
          .from('profiles')
          .select('id, full_name, role, assigned_lgas, assigned_wards, assigned_pus')
          .eq('candidate_id', user.id)
          .eq('role', 'POLLING_UNIT_AGENT');

        let validAgentIds = [];
        if (!personnelError && personnelData) {
          setCampaignPersonnel(personnelData);
          // Extract specific user IDs of all personnel deployed down your chain
          validAgentIds = personnelData.map(p => p.id).filter(Boolean);
          console.log(validAgentIds, "are my agents");

        }

        // FETCH REALTIME DOCUMENT AUDITS RESULTS DATA SCOPED STRICTLY TO YOUR USERS
        if (validAgentIds.length > 0) {
          const { data: auditsData, error: auditsError } = await supabase
            .from('document_audits')
            .select('id, agent_id, pu_id, pu_code, results, image_url, created_at')
            .in('agent_id', validAgentIds); // Fixes leakage: Only pulls entries assigned to your agents

          if (!auditsError && auditsData) {
            setDocumentAudits(auditsData);
            calculateCumulativeTotals(auditsData);
          }
        } else {
          setDocumentAudits([]);
          setCumulativeTotals({});
        }

        // Initial Root Hydration: If they have a state, pre-load its topology structures
        if (currentScope.state) {
          await fetchTreeTopologyRoot(stateName, seat, lgaName, stateConstituency, senatorialDistrict, federalConstituency);
        }
      } catch (err) {
        console.error("Root tree alignment error:", err);
        setError('An unexpected error occurred building territory structural branches.');
      } finally {
        setIsLoading(false);
      }
    }

    loadResultsDashboardRoot();
  }, [supabase]);

  // Determine targeted structural context arrays based on user scope values
  const isSubLgaContext = userScope.role === 'house_of_assembly' || rootWards.length > 0;

  const targetedLgas = userScope.role === 'chairman' || userScope.role === 'house_of_assembly' || userScope.role === 'councillor'
    ? lgas.filter(l => l.name?.toLowerCase() === userScope.lga?.toLowerCase())
    : lgas;

  // Aggregate cumulative running scores dynamically across all ingested units
  const calculateCumulativeTotals = (audits) => {
    const totals = {};
    audits.forEach(audit => {
      const scores = audit.results;
      if (scores && typeof scores === 'object') {
        Object.entries(scores).forEach(([party, votes]) => {
          const cleanParty = party.toUpperCase().trim();
          const cleanVotes = Number(votes) || 0;
          totals[cleanParty] = (totals[cleanParty] || 0) + cleanVotes;
        });
      }
    });

    // Sort parties by highest votes
    const sortedTotals = Object.fromEntries(
      Object.entries(totals).sort(([, a], [, b]) => b - a)
    );
    setCumulativeTotals(sortedTotals);
  };

  // Combined Architecture Hydration Picker: Instantly falls back to sub-LGA ward promotion arrays when needed
  const fetchTreeTopologyRoot = async (stateName, seat, lgaName, stateConstituency, senatorialDistrict, federalConstituency) => {
    try {
      let url = `/api/locations?state=${encodeURIComponent(stateName)}&all=true&includeSupervisors=true&includeAgents=true`;

      // Append macro structural scopes dynamically
      if (seat === 'senate' && senatorialDistrict) {
        url += `&senatorial_district=${encodeURIComponent(senatorialDistrict)}&seat=senate`;
      } else if (seat === 'house_of_reps' && federalConstituency) {
        url += `&fed_constituency=${encodeURIComponent(federalConstituency)}&seat=house_of_reps`;
      } else if (seat === 'house_of_assembly' && stateConstituency) {
        url += `&state_constituency=${encodeURIComponent(stateConstituency)}&seat=house_of_assembly`;
        if (lgaName) url += `&lga=${encodeURIComponent(lgaName)}`;
      } else if (seat === 'governor') {
        url += `&seat=governor`;
      }

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();

        // DYNAMIC TREE FIX: If the returned payload lacks structural macro LGAs but contains direct sub-LGA wards, elevate them
        if (data.wards && (!data.lgas || data.lgas.length === 0)) {
          setRootWards(data.wards);
          setLgas([]);

          // Pre-hydrate nested unit matrices for elevated root wards if attached directly to payload
          const structuralPusMap = {};
          data.wards.forEach(ward => {
            if (ward.pollingUnits) {
              structuralPusMap[ward.name] = ward.pollingUnits;
            }
          });
          setPuData(prev => ({ ...prev, ...structuralPusMap }));
        } else if (data.lgas && data.lgas.length > 0 && data.lgas[0].wards) {
          const processedLgas = [];
          const structuralWardsMap = {};
          const structuralPusMap = {};

          data.lgas.forEach(lga => {
            processedLgas.push({
              id: lga.id,
              name: lga.name,
              abbreviation: lga.abbreviation,
              wardCount: lga.wards ? lga.wards.length : 0,
              puCount: lga.wards ? lga.wards.reduce((acc, w) => acc + (w.pollingUnits ? w.pollingUnits.length : 0), 0) : 0,
              reportedCount: lga.reportedCount || lga.reported_count || 0
            });

            if (lga.wards) {
              structuralWardsMap[lga.name] = lga.wards.map(ward => ({
                id: ward.id,
                name: ward.name,
                abbreviation: ward.abbreviation,
                puCount: ward.pollingUnits ? ward.pollingUnits.length : 0,
                reportedCount: ward.reportedCount || ward.reported_count || 0
              }));

              lga.wards.forEach(ward => {
                if (ward.pollingUnits) {
                  structuralPusMap[ward.name] = ward.pollingUnits;
                }
              });
            }
          });

          setLgas(processedLgas);
          setWardsData(structuralWardsMap);
          setPuData(structuralPusMap);
          setRootWards([]);
        } else {
          setLgas(data.lgas || []);
          setRootWards([]);
        }
      }
    } catch (err) {
      console.error("Failed fetching unified structural tree:", err);
    }
  };

  // Async Fetch Branch: Wards & supervisors mapping info
  const fetchTreeWards = async (lgaName) => {
    if (wardsData[lgaName]) return; // Client cache hit

    try {
      const res = await fetch(`/api/locations?state=${encodeURIComponent(userScope.state)}&lga=${encodeURIComponent(lgaName)}&includeSupervisors=true`);
      if (res.ok) {
        const data = await res.json();
        setWardsData(prev => ({
          ...prev,
          [lgaName]: data.wards || []
        }));
      }
    } catch (err) {
      console.error(`Failed resolving Wards for ${lgaName}:`, err);
    }
  };

  // Async Fetch Branch: Polling Units & assigned field officials
  const fetchTreePollingUnits = async (lgaName, wardName) => {
    if (puData[wardName]) return; // Client cache hit

    try {
      const cleanLgaParam = lgaName ? `&lga=${encodeURIComponent(lgaName)}` : '';
      const res = await fetch(`/api/locations?state=${encodeURIComponent(userScope.state)}${cleanLgaParam}&ward=${encodeURIComponent(wardName)}&includeAgents=true`);
      if (res.ok) {
        const data = await res.json();
        setPuData(prev => ({
          ...prev,
          [wardName]: data.pollingUnits || []
        }));
      }
    } catch (err) {
      console.error(`Failed resolving Polling Units for ${wardName}:`, err);
    }
  };

  // Toggle Action: Deep structure tree leaf expansion
  const toggleLga = (lgaName) => {
    const isExpanding = !expandedLgas[lgaName];
    setExpandedLgas(prev => ({ ...prev, [lgaName]: isExpanding }));

    if (isExpanding) {
      startTransition(async () => {
        await fetchTreeWards(lgaName);
      });
    }
  };

  const toggleWard = (lgaName, wardName) => {
    const isExpanding = !expandedWards[wardName];
    setExpandedWards(prev => ({ ...prev, [wardName]: isExpanding }));

    if (isExpanding) {
      startTransition(async () => {
        await fetchTreePollingUnits(lgaName, wardName);
      });
    }
  };

  // CROSS-REFERENCE LOCAL MATCHERS FOR POLLING UNIT AUDIT ENTRIES
  const getPollingUnitAuditRecord = (puCode) => {
    return documentAudits.find(audit =>
      (audit.pu_code && puCode && audit.pu_code.toUpperCase() === puCode.toUpperCase()) ||
      (audit.pu_id && puCode && audit.pu_id.toUpperCase() === puCode.toUpperCase())
    );
  };

  const getPollingUnitResults = (puCode, puName) => {
    const match = getPollingUnitAuditRecord(puCode);
    return match ? match.results : null;
  };

  if (isLoading) {
    return <LoadingOverlay message="Aggregating live electoral matrix returns..." />;
  }

  // Macro structural state calculations for the dynamic progress bars
  const totalStateExpectedPus = isSubLgaContext
    ? rootWards.reduce((acc, w) => acc + (w.puCount || w.pu_count || 0), 0)
    : lgas.reduce((acc, current) => acc + (current.puCount || current.pu_count || 0), 0);

  const totalStateReportedPus = documentAudits.length;
  const stateIngestionRatio = totalStateExpectedPus > 0 ? (totalStateReportedPus / totalStateExpectedPus) * 100 : 0;

  return (
    <main className="p-4 md:p-8 max-w-5xl mx-auto space-y-8 text-[#291C14]">
      {isPending && <LoadingOverlay message="Querying structural node results..." />}

      {/* Top Operational Breadcrumb Tracker */}
      <div className="border-b border-[#8A7968]/30 pb-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wider">Electoral Live Results Room</h1>
          <p className="text-xs font-medium text-[#8A7968] mt-1">
            Real-time calculation metrics and compiled unit analytics running straight from primary audit data down to structural roots.
          </p>
        </div>
        <div className="bg-[#FAF6F0] border border-[#8A7968]/20 px-4 py-2 rounded-lg text-right">
          <span className="block text-[9px] font-black uppercase text-[#8A7968] tracking-widest">Candidate View Scope</span>
          <span className="text-xs font-bold uppercase tracking-wide">
            {userScope.role ? userScope.role.replace(/_/g, ' ') : 'Global Campaign Headquarters'} ({userScope.state || 'All States'})
            {userScope.lga && ` - ${userScope.lga} LGA`}
            {userScope.stateConstituency && ` [${userScope.stateConstituency}]`}
          </span>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-500/30 text-red-700 text-xs font-bold uppercase tracking-wide rounded-lg">
          {error}
        </div>
      )}

      {/* LIVE RUNNING RUNTIME ACCUMULATED SCORE WALL */}
      <div className="bg-[#FAF6F0] border border-[#8A7968]/30 rounded-xl p-6 space-y-4">
        <div>
          <span className="text-[10px] font-black tracking-widest text-[#8A7968] uppercase">ACCUMULATED RUNNING TOTALS</span>
          <h2 className="text-lg font-black uppercase tracking-tight">Consolidated Polling Units Tally Summary</h2>
          <p className="text-[10px] font-medium text-[#8A7968] italic mt-0.5">*Reflecting strictly items verified from inside your authorized agent registry pool.</p>
        </div>

        {Object.keys(cumulativeTotals).length === 0 ? (
          <p className="text-xs italic font-medium text-[#8A7968]/80 bg-white/60 p-4 border border-dashed border-[#8A7968]/20 rounded-lg">
            Waiting for field reports... No structural metrics have been verified by unit agents yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {Object.entries(cumulativeTotals).map(([party, total]) => (
              <div key={party} className="bg-white border border-[#8A7968]/20 rounded-lg p-4 flex flex-col justify-between relative overflow-hidden shadow-xs">
                <div className="absolute right-2 top-1 text-3xl font-black text-[#FAF6F0] select-none z-0">
                  {party}
                </div>
                <span className="text-[10px] font-black tracking-wider text-[#8A7968] z-10">{party}</span>
                <span className="text-2xl font-black mt-2 tracking-tight z-10">
                  {total.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Core Tree Hierarchy Container */}
      <div className="bg-white border border-[#8A7968]/30 rounded-xl p-6 space-y-6">
        <div>
          <h3 className="text-base font-black uppercase tracking-wide">Structured Territorial Breakdown</h3>
          <p className="text-xs text-[#8A7968] font-medium">Monitor real-time ingestion rates below. Expand entries to locate unsubmitted boundaries.</p>
        </div>

        {/* Level 0: State Anchor Node */}
        <div className="bg-[#FAF6F0] p-5 rounded-xl border border-[#8A7968]/30 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 rounded-full bg-[#9A6749] animate-pulse" />
              <div>
                <span className="block text-[9px] font-bold text-[#8A7968] uppercase tracking-widest">State Data Node</span>
                <h2 className="text-base font-black uppercase tracking-wider">{userScope.state || 'N/A'} State</h2>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <span className="text-[10px] font-bold block text-[#8A7968] uppercase tracking-wide">
                Total Regional Ingestion
              </span>
              <span className="text-xs font-black uppercase text-[#291C14]">
                {totalStateReportedPus} / {totalStateExpectedPus} Units Ingested ({stateIngestionRatio.toFixed(1)}%)
              </span>
            </div>
          </div>

          {/* State Progress Bar */}
          <div className="w-full bg-[#291C14]/10 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-[#9A6749] h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(stateIngestionRatio, 100)}%` }}
            />
          </div>
        </div>

        {/* Dynamic Level 1 Branch Selection: Swaps between LGA map items and direct Ward layouts */}
        <div className="space-y-4 pl-2 md:pl-4 border-l border-[#8A7968]/20">

          {!isSubLgaContext ? (
            /* STANDARD LGA TREE RENDER BLOCK */
            targetedLgas.length === 0 ? (
              <p className="text-xs italic text-[#8A7968] font-medium pl-2">No Local Government Areas mapped under this configuration filter scope.</p>
            ) : (
              targetedLgas.map(lga => {
                const isLgaOpen = !!expandedLgas[lga.name];
                const structuralWards = wardsData[lga.name] || [];
                const totalLgaExpectedPus = lga.puCount || lga.pu_count || 0;

                const apiLgaReported = lga.reportedCount || lga.reported_count || 0;
                const calculatedLgaReported = structuralWards.reduce((acc, ward) => {
                  const localizedPus = puData[ward.name] || [];
                  const wardReported = localizedPus.length > 0
                    ? localizedPus.filter(pu => getPollingUnitResults(pu.code || pu.polling_unit_code)).length
                    : (ward.reportedCount || ward.reported_count || 0);
                  return acc + wardReported;
                }, 0);

                const totalLgaReportedPus = Math.max(apiLgaReported, calculatedLgaReported);
                const lgaIngestionRatio = totalLgaExpectedPus > 0 ? (totalLgaReportedPus / totalLgaExpectedPus) * 100 : 0;

                return (
                  <div key={lga.name} className="border border-[#8A7968]/15 rounded-xl overflow-hidden bg-white">
                    {lga.name && (
                      <div
                        onClick={() => toggleLga(lga.name)}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#FAF6F0]/40 hover:bg-[#FAF6F0]/80 border-b border-[#8A7968]/15 cursor-pointer transition-all select-none gap-4"
                      >
                        <div className="flex items-start space-x-3">
                          <span className="text-xs text-[#8A7968] mt-0.5">
                            {isLgaOpen ? '▼' : '▶'}
                          </span>
                          <div>
                            <h4 className="text-sm font-black uppercase tracking-wide">{lga.name} LGA</h4>
                            <span className="text-[10px] text-[#8A7968] font-bold uppercase block mt-0.5">
                              {lga.wardCount || lga.ward_count || 0} Wards Mapped
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col w-full sm:w-64 space-y-1.5 sm:text-right">
                          <div className="flex justify-between text-[10px] font-bold uppercase tracking-tight">
                            <span className="text-[#8A7968]">Ingestion Progress:</span>
                            <span className="text-[#291C14]">{totalLgaReportedPus}/{totalLgaExpectedPus} PUs ({lgaIngestionRatio.toFixed(0)}%)</span>
                          </div>
                          <div className="w-full bg-[#291C14]/10 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-[#291C14] h-full rounded-full transition-all duration-300"
                              style={{ width: `${Math.min(lgaIngestionRatio, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {isLgaOpen && (
                      <div className="p-4 bg-white space-y-3 border-t border-[#8A7968]/10">
                        {structuralWards.length === 0 ? (
                          <div className="flex items-center space-x-2 text-[10px] font-bold uppercase tracking-wider text-[#8A7968]/60 py-2 pl-2 italic">
                            <div className="w-2.5 h-2.5 rounded-full border border-t-transparent border-[#8A7968] animate-spin" />
                            <span>Querying regional data points...</span>
                          </div>
                        ) : (
                          structuralWards.map(ward => {
                            const isWardOpen = !!expandedWards[ward.name];
                            const localizedPus = puData[ward.name] || [];
                            const totalWardExpectedPus = ward.puCount || ward.pu_count || 0;

                            const apiWardReported = ward.reportedCount || ward.reported_count || 0;
                            const calculatedWardReported = localizedPus.length > 0
                              ? localizedPus.filter(pu => getPollingUnitResults(pu.code || pu.polling_unit_code)).length
                              : 0;

                            const totalWardReportedPus = Math.max(apiWardReported, calculatedWardReported);
                            const wardIngestionRatio = totalWardExpectedPus > 0 ? (totalWardReportedPus / totalWardExpectedPus) * 100 : 0;

                            return (
                              <div key={ward.name} className="border border-[#8A7968]/15 rounded-lg bg-[#FAF6F0]/20 overflow-hidden">
                                <div
                                  onClick={() => toggleWard(lga.name, ward.name)}
                                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-white hover:bg-[#FAF6F0]/50 border-b border-[#8A7968]/10 cursor-pointer transition-all select-none gap-3"
                                >
                                  <div className="flex items-center space-x-2.5">
                                    <span className="text-[10px] text-[#9A6749]">
                                      {isWardOpen ? '▼' : '▶'}
                                    </span>
                                    <div>
                                      <h5 className="text-xs font-black uppercase tracking-wide">{ward.name} Ward</h5>
                                      <span className="text-[9px] text-[#8A7968] font-bold uppercase block">
                                        {totalWardExpectedPus} Units Assigned
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center space-x-3 w-full sm:w-48">
                                    <div className="w-full bg-[#291C14]/10 h-1.5 rounded-full overflow-hidden">
                                      <div
                                        className="bg-[#9A6749] h-full rounded-full"
                                        style={{ width: `${Math.min(wardIngestionRatio, 100)}%` }}
                                      />
                                    </div>
                                    <span className="text-[10px] font-bold whitespace-nowrap text-[#291C14]">
                                      {totalWardReportedPus}/{totalWardExpectedPus} ({wardIngestionRatio.toFixed(0)}%)
                                    </span>
                                  </div>
                                </div>

                                {isWardOpen && (
                                  <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3 bg-white border-t border-[#8A7968]/10">
                                    {localizedPus.length === 0 ? (
                                      <div className="flex items-center space-x-2 text-[9px] font-bold uppercase tracking-wider text-[#8A7968]/60 col-span-2 py-2 italic">
                                        <div className="w-2.5 h-2.5 rounded-full border border-t-transparent border-[#8A7968] animate-spin" />
                                        <span>Mapping unit nodes into registry matrix...</span>
                                      </div>
                                    ) : (
                                      localizedPus.map(pu => {
                                        const puCode = pu.code || pu.polling_unit_code;
                                        const auditRecord = getPollingUnitAuditRecord(puCode);
                                        const results = auditRecord ? auditRecord.results : null;
                                        const hasData = results && typeof results === 'object' && Object.keys(results).length > 0;
                                        const documentImgUrl = auditRecord ? auditRecord.image_url : null;

                                        return (
                                          <div
                                            key={pu.id || puCode || pu.name}
                                            className={`p-3 border rounded-lg flex flex-col justify-between space-y-3 transition-all ${hasData
                                              ? 'bg-white border-[#8A7968]/30 shadow-2xs'
                                              : 'bg-[#FAF6F0]/30 border-dashed border-[#8A7968]/20'
                                              }`}
                                          >
                                            <div className="flex justify-between items-start gap-2">
                                              <div>
                                                <span className="block text-[8px] font-black tracking-widest text-[#8A7968] uppercase">
                                                  CODE: {puCode || 'N/A'}
                                                </span>
                                                <h6 className="text-[11px] font-black uppercase tracking-tight leading-tight mt-0.5">
                                                  {pu.name}
                                                </h6>
                                              </div>
                                              <span className={`text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-wide whitespace-nowrap ${hasData ? 'bg-[#291C14] text-white' : 'bg-[#8A7968]/10 text-[#8A7968]'}`}>
                                                {hasData ? 'Verified Submissions' : 'Pending Ingestion'}
                                              </span>
                                            </div>

                                            <div className="bg-[#FAF6F0]/60 rounded-md p-2.5 border border-[#8A7968]/10 text-[9px] space-y-1.5">
                                              <span className="block text-[8px] font-black uppercase text-[#8A7968]/80 tracking-wider">
                                                AUDITED RESULTS RECORD:
                                              </span>
                                              {hasData ? (
                                                <div className="space-y-3">
                                                  <div className="grid grid-cols-3 gap-1.5 font-bold">
                                                    {Object.entries(results).map(([party, value]) => (
                                                      <div key={party} className="flex justify-between bg-white px-1.5 py-1 border border-[#8A7968]/10 rounded">
                                                        <span className="text-[#8A7968]">{party}:</span>
                                                        <span className="text-[#291C14]">{value}</span>
                                                      </div>
                                                    ))}
                                                  </div>

                                                  {documentImgUrl && (
                                                    <button
                                                      type="button"
                                                      onClick={() => setActiveLightboxUrl(documentImgUrl)}
                                                      className="w-full mt-1 bg-white hover:bg-[#291C14] hover:text-white text-[#291C14] text-[9px] font-black uppercase tracking-wider py-1.5 px-3 border border-[#291C14]/30 rounded transition-colors duration-150 flex items-center justify-center space-x-1.5"
                                                    >
                                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                      </svg>
                                                      <span>Check Original Document</span>
                                                    </button>
                                                  )}
                                                </div>
                                              ) : (
                                                <span className="block text-[9px] text-[#8A7968]/80 font-bold uppercase tracking-tight py-0.5 italic">
                                                  Awaiting data transmission from field agent
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )
          ) : (
            /* SUB-LGA DIRECT WARD ROOT TREE BLOCK */
            rootWards.length === 0 ? (
              <p className="text-xs italic text-[#8A7968] font-medium pl-2">No Electoral Wards mapped under this localized configuration scope footprint.</p>
            ) : (
              rootWards.map(ward => {
                const isWardOpen = !!expandedWards[ward.name];
                const localizedPus = puData[ward.name] || [];
                const totalWardExpectedPus = ward.puCount || ward.pu_count || 0;

                const calculatedWardReported = localizedPus.filter(pu =>
                  getPollingUnitResults(pu.code || pu.polling_unit_code)
                ).length;

                const totalWardReportedPus = Math.max(ward.reportedCount || 0, calculatedWardReported);
                const wardIngestionRatio = totalWardExpectedPus > 0 ? (totalWardReportedPus / totalWardExpectedPus) * 100 : 0;

                return (
                  <div key={ward.name} className="border border-[#8A7968]/15 rounded-xl overflow-hidden bg-white">
                    <div
                      onClick={() => toggleWard(userScope.lga, ward.name)}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#FAF6F0]/40 hover:bg-[#FAF6F0]/80 border-b border-[#8A7968]/15 cursor-pointer transition-all select-none gap-4"
                    >
                      <div className="flex items-start space-x-3">
                        <span className="text-xs text-[#8A7968] mt-0.5">
                          {isWardOpen ? '▼' : '▶'}
                        </span>
                        <div>
                          <h5 className="text-sm font-black uppercase tracking-wide">{ward.name} Ward</h5>
                          <span className="text-[10px] text-[#8A7968] font-bold uppercase block mt-0.5">
                            {totalWardExpectedPus} Units Assigned Inside Active Scope
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col w-full sm:w-64 space-y-1.5 sm:text-right">
                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-tight">
                          <span className="text-[#8A7968]">Ward Ingestion:</span>
                          <span className="text-[#291C14]">{totalWardReportedPus}/{totalWardExpectedPus} ({wardIngestionRatio.toFixed(0)}%)</span>
                        </div>
                        <div className="w-full bg-[#291C14]/10 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-[#9A6749] h-full rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(wardIngestionRatio, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {isWardOpen && (
                      <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3 bg-white border-t border-[#8A7968]/10">
                        {localizedPus.length === 0 ? (
                          <div className="flex items-center space-x-2 text-[9px] font-bold uppercase tracking-wider text-[#8A7968]/60 col-span-2 py-2 italic">
                            <div className="w-2.5 h-2.5 rounded-full border border-t-transparent border-[#8A7968] animate-spin" />
                            <span>Mapping unit nodes into registry matrix...</span>
                          </div>
                        ) : (
                          localizedPus.map(pu => {
                            const puCode = pu.code || pu.polling_unit_code;
                            const auditRecord = getPollingUnitAuditRecord(puCode);
                            const results = auditRecord ? auditRecord.results : null;
                            const hasData = results && typeof results === 'object' && Object.keys(results).length > 0;
                            const documentImgUrl = auditRecord ? auditRecord.image_url : null;

                            return (
                              <div
                                key={pu.id || puCode || pu.name}
                                className={`p-3 border rounded-lg flex flex-col justify-between space-y-3 transition-all ${hasData
                                  ? 'bg-white border-[#8A7968]/30 shadow-2xs'
                                  : 'bg-[#FAF6F0]/30 border-dashed border-[#8A7968]/20'
                                  }`}
                              >
                                <div className="flex justify-between items-start gap-2">
                                  <div>
                                    <span className="block text-[8px] font-black tracking-widest text-[#8A7968] uppercase">
                                      CODE: {puCode || 'N/A'}
                                    </span>
                                    <h6 className="text-[11px] font-black uppercase tracking-tight leading-tight mt-0.5">
                                      {pu.name}
                                    </h6>
                                  </div>
                                  <span className={`text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-wide whitespace-nowrap ${hasData ? 'bg-[#291C14] text-white' : 'bg-[#8A7968]/10 text-[#8A7968]'}`}>
                                    {hasData ? 'Verified Submissions' : 'Pending Ingestion'}
                                  </span>
                                </div>

                                <div className="bg-[#FAF6F0]/60 rounded-md p-2.5 border border-[#8A7968]/10 text-[9px] space-y-1.5">
                                  <span className="block text-[8px] font-black uppercase text-[#8A7968]/80 tracking-wider">
                                    AUDITED RESULTS RECORD:
                                  </span>
                                  {hasData ? (
                                    <div className="space-y-3">
                                      <div className="grid grid-cols-3 gap-1.5 font-bold">
                                        {Object.entries(results).map(([party, value]) => (
                                          <div key={party} className="flex justify-between bg-white px-1.5 py-1 border border-[#8A7968]/10 rounded">
                                            <span className="text-[#8A7968]">{party}:</span>
                                            <span className="text-[#291C14]">{value}</span>
                                          </div>
                                        ))}
                                      </div>

                                      {documentImgUrl && (
                                        <button
                                          type="button"
                                          onClick={() => setActiveLightboxUrl(documentImgUrl)}
                                          className="w-full mt-1 bg-white hover:bg-[#291C14] hover:text-white text-[#291C14] text-[9px] font-black uppercase tracking-wider py-1.5 px-3 border border-[#291C14]/30 rounded transition-colors duration-150 flex items-center justify-center space-x-1.5"
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                          </svg>
                                          <span>Check Original Document</span>
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="block text-[9px] text-[#8A7968]/80 font-bold uppercase tracking-tight py-0.5 italic">
                                      Awaiting data transmission from field agent
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )
          )}

        </div>
      </div>

      {/* SECURE LIGHTBOX MODAL CONTAINER */}
      {activeLightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-4 transition-opacity duration-200"
          onClick={() => setActiveLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setActiveLightboxUrl(null)}
            className="absolute top-4 right-4 text-white hover:text-[#FAF6F0] bg-white/10 hover:bg-white/20 p-2.5 rounded-full transition-colors duration-150 focus:outline-none"
            title="Close Preview"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div
            className="relative max-w-3xl max-h-[85vh] w-full bg-[#FAF6F0] rounded-xl overflow-hidden border border-white/20 shadow-2xl p-2 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2 border-b border-[#8A7968]/20 flex justify-between items-center bg-white rounded-t-lg">
              <span className="text-[10px] font-black uppercase text-[#291C14] tracking-wider flex items-center space-x-1.5">
                <svg className="w-3.5 h-3.5 text-[#9A6749]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>Secured Document Audit Sheet View</span>
              </span>
              <span className="text-[9px] font-bold text-[#8A7968] bg-[#FAF6F0] px-2 py-0.5 rounded border border-[#8A7968]/20 uppercase">
                Read-Only Preview
              </span>
            </div>

            <div className="flex-1 bg-black/5 flex items-center justify-center p-2 min-h-0 overflow-auto rounded-b-lg">
              <img
                src={activeLightboxUrl}
                alt="Electoral Audit Verification Sheet Document"
                className="max-w-full max-h-[70vh] object-contain select-none shadow-md rounded"
                draggable="false"
                onContextMenu={(e) => e.preventDefault()}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}