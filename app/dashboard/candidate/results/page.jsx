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
    return <LoadingOverlay message="Loading live election results..." />;
  }

  // Macro structural state calculations for the dynamic progress bars
  const totalStateExpectedPus = isSubLgaContext
    ? rootWards.reduce((acc, w) => acc + (w.puCount || w.pu_count || 0), 0)
    : lgas.reduce((acc, current) => acc + (current.puCount || current.pu_count || 0), 0);

  const totalStateReportedPus = documentAudits.length;
  const stateIngestionRatio = totalStateExpectedPus > 0 ? (totalStateReportedPus / totalStateExpectedPus) * 100 : 0;

  // Find the maximum votes in the cumulative totals to highlight the leading political party
  const maxCumulativeVotes = Object.keys(cumulativeTotals).length > 0
    ? Math.max(...Object.values(cumulativeTotals).map(Number))
    : 0;

  return (
    <main className="p-4 md:p-8 max-w-5xl mx-auto space-y-8 text-slate-800">
      {isPending && <LoadingOverlay message="Updating election results..." />}

      {/* Top Operational Location Tracker */}
      <div className="border-b border-slate-200 pb-6 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Live Election Results</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Real-time vote tallies and reporting progress directly from field agents.
          </p>
        </div>
        <div className="bg-white border border-slate-200 px-4 py-3 rounded-xl shadow-sm text-left md:text-right">
          <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Administrative Jurisdiction</span>
          <span className="text-sm font-bold text-slate-800 tracking-wide">
            {userScope.role ? userScope.role.replace(/_/g, ' ').toUpperCase() : 'CENTRAL HEADQUARTERS'} ({userScope.state || 'All States'})
            {userScope.lga && ` - ${userScope.lga} Local Government Area`}
            {userScope.stateConstituency && ` [${userScope.stateConstituency}]`}
          </span>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-xl flex items-center space-x-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          <span>{error}</span>
        </div>
      )}

      {/* CUMULATIVE LIVE TOTALS SECTION */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Cumulative Vote Tallies</h2>
          <p className="text-sm text-slate-500 mt-1">Total aggregated votes compiled from all verified polling unit submissions.</p>
        </div>

        {Object.keys(cumulativeTotals).length === 0 ? (
          <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center">
            <p className="text-sm font-medium text-slate-500">
              Awaiting field updates... No election results have been submitted by agents yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {Object.entries(cumulativeTotals).map(([party, total]) => {
              const isHighest = Number(total) === maxCumulativeVotes && maxCumulativeVotes > 0;
              return (
                <div
                  key={party}
                  className={`border rounded-xl p-5 flex flex-col justify-between relative overflow-hidden transition-all ${isHighest ? 'bg-green-50 border-green-500 shadow-md ring-1 ring-green-500/20' : 'bg-slate-50 border-slate-200'
                    }`}
                >
                  {isHighest && (
                    <div className="absolute top-3 right-3 bg-green-100 p-1 rounded-full text-green-600" title="Currently Leading">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  <span className={`text-sm font-bold tracking-wide ${isHighest ? 'text-green-800' : 'text-slate-500'}`}>
                    {party}
                  </span>
                  <span className={`text-3xl font-black mt-2 tracking-tight ${isHighest ? 'text-green-700' : 'text-slate-900'}`}>
                    {total.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Core Territorial Tree Hierarchy Container */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Regional Breakdown</h3>
          <p className="text-sm text-slate-500 mt-1">Track regional reporting status. Expand areas down to specific polling units to review source documents.</p>
        </div>

        {/* Level 0: State Anchor Node */}
        <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 rounded-full bg-[#9A6749] animate-pulse" />
              <div>
                <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">State Level</span>
                <h2 className="text-lg font-bold text-slate-900">{userScope.state || 'N/A'} State</h2>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <span className="text-xs font-semibold block text-slate-500 uppercase tracking-wider mb-1">
                Total Polling Units Reported
              </span>
              <span className="text-sm font-bold text-slate-900">
                {totalStateReportedPus} of {totalStateExpectedPus} ({stateIngestionRatio.toFixed(1)}%)
              </span>
            </div>
          </div>

          {/* State Reporting Progress Bar */}
          <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-[#9A6749] h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(stateIngestionRatio, 100)}%` }}
            />
          </div>
        </div>

        {/* Dynamic Level 1 Branch Selection: Swaps between LGA map items and direct Ward layouts */}
        <div className="space-y-4 pl-2 md:pl-4 border-l-2 border-slate-100">

          {!isSubLgaContext ? (
            /* STANDARD LGA TREE RENDER BLOCK */
            targetedLgas.length === 0 ? (
              <p className="text-sm text-slate-500 font-medium pl-2">No Local Government Areas found for this view.</p>
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
                  <div key={lga.name} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                    {lga.name && (
                      <div
                        onClick={() => toggleLga(lga.name)}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-slate-50 cursor-pointer transition-all select-none gap-4"
                      >
                        <div className="flex items-center space-x-3">
                          <div className={`p-1.5 rounded-md ${isLgaOpen ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-500'}`}>
                            <svg className={`w-4 h-4 transition-transform ${isLgaOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                          </div>
                          <div>
                            <h4 className="text-base font-bold text-slate-800">{lga.name} Local Government Area</h4>
                            <span className="text-xs text-slate-500 font-medium mt-0.5 block">
                              {lga.wardCount || lga.ward_count || 0} Wards
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col w-full sm:w-64 space-y-2 sm:text-right">
                          <div className="flex justify-between text-xs font-semibold text-slate-600">
                            <span>Reporting Progress:</span>
                            <span className="text-slate-900">{totalLgaReportedPus} / {totalLgaExpectedPus} ({lgaIngestionRatio.toFixed(0)}%)</span>
                          </div>
                          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-[#9A6749] h-full rounded-full transition-all duration-300"
                              style={{ width: `${Math.min(lgaIngestionRatio, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {isLgaOpen && (
                      <div className="p-4 bg-slate-50 space-y-3 border-t border-slate-200">
                        {structuralWards.length === 0 ? (
                          <div className="flex items-center space-x-2 text-sm text-slate-500 py-2 pl-2">
                            <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                            <span>Loading wards...</span>
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
                              <div key={ward.name} className="border border-slate-200 rounded-lg bg-white overflow-hidden shadow-sm">
                                <div
                                  onClick={() => toggleWard(lga.name, ward.name)}
                                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 hover:bg-slate-50 cursor-pointer transition-all select-none gap-3"
                                >
                                  <div className="flex items-center space-x-3">
                                    <div className={`p-1 rounded text-slate-400 ${isWardOpen ? 'bg-slate-100' : ''}`}>
                                      <svg className={`w-3.5 h-3.5 transition-transform ${isWardOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                                    </div>
                                    <div>
                                      <h5 className="text-sm font-bold text-slate-800">{ward.name} Ward</h5>
                                      <span className="text-xs text-slate-500 font-medium block">
                                        {totalWardExpectedPus} Polling Units
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center space-x-3 w-full sm:w-48">
                                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                      <div
                                        className="bg-[#9A6749] h-full rounded-full"
                                        style={{ width: `${Math.min(wardIngestionRatio, 100)}%` }}
                                      />
                                    </div>
                                    <span className="text-xs font-semibold whitespace-nowrap text-slate-700">
                                      {totalWardReportedPus} / {totalWardExpectedPus}
                                    </span>
                                  </div>
                                </div>

                                {isWardOpen && (
                                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 border-t border-slate-200">
                                    {localizedPus.length === 0 ? (
                                      <div className="flex items-center space-x-2 text-sm text-slate-500 col-span-2 py-2">
                                        <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                                        <span>Loading polling units...</span>
                                      </div>
                                    ) : (
                                      /* POLLING UNIT DISPLAY MATRIX */
                                      localizedPus.map(pu => {
                                        const puCode = pu.code || pu.polling_unit_code;
                                        const auditRecord = getPollingUnitAuditRecord(puCode);
                                        const results = auditRecord ? auditRecord.results : null;
                                        const hasData = results && typeof results === 'object' && Object.keys(results).length > 0;
                                        const documentImgUrl = auditRecord ? auditRecord.image_url : null;

                                        // Determine highest votes for this specific PU to emphasize the leading party
                                        const maxPuVotes = hasData ? Math.max(...Object.values(results).map(Number)) : 0;

                                        return (
                                          <div
                                            key={pu.id || puCode || pu.name}
                                            className={`p-4 border rounded-xl flex flex-col justify-between space-y-4 transition-all ${hasData
                                              ? 'bg-white border-slate-300 shadow-sm'
                                              : 'bg-white border-dashed border-slate-200 opacity-75'
                                              }`}
                                          >
                                            <div className="flex justify-between items-start gap-3">
                                              <div>
                                                <span className="block text-xs font-bold text-slate-400 mb-1">
                                                  Code: {puCode || 'N/A'}
                                                </span>
                                                <h6 className="text-sm font-semibold text-slate-800 leading-snug">
                                                  {pu.name}
                                                </h6>
                                              </div>
                                              <span className={`text-xs font-semibold px-2.5 py-1 rounded-md whitespace-nowrap ${hasData ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                                {hasData ? 'Results Verified' : 'Awaiting Agent'}
                                              </span>
                                            </div>

                                            <div className={`rounded-lg p-3 border ${hasData ? 'bg-slate-50 border-slate-100' : 'bg-transparent border-transparent'}`}>
                                              {hasData && <span className="block text-xs font-semibold text-slate-500 mb-2">SUBMITTED SCORES:</span>}
                                              {hasData ? (
                                                <div className="space-y-3">
                                                  <div className="grid grid-cols-2 gap-2">
                                                    {Object.entries(results).map(([party, value]) => {
                                                      const isLeading = Number(value) === maxPuVotes && maxPuVotes > 0;
                                                      return (
                                                        <div key={party} className={`flex justify-between items-center px-2.5 py-1.5 border rounded-md ${isLeading ? 'bg-green-50 border-green-500 text-green-800 font-bold' : 'bg-white border-slate-200 text-slate-700 font-medium'}`}>
                                                          <span className="text-sm">{party}</span>
                                                          <div className="flex items-center space-x-1">
                                                            <span className="text-sm">{value}</span>
                                                            {isLeading && <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>}
                                                          </div>
                                                        </div>
                                                      );
                                                    })}
                                                  </div>

                                                  {documentImgUrl && (
                                                    <button
                                                      type="button"
                                                      onClick={() => setActiveLightboxUrl(documentImgUrl)}
                                                      className="w-full mt-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold py-2 px-3 border border-slate-300 rounded-md transition-colors duration-150 flex items-center justify-center space-x-2"
                                                    >
                                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                      </svg>
                                                      <span>Verify Sheet Document</span>
                                                    </button>
                                                  )}
                                                </div>
                                              ) : (
                                                <span className="block text-sm text-slate-400 font-medium italic">
                                                  No returns filed yet.
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
              <p className="text-sm text-slate-500 font-medium pl-2">No Electoral Wards found for this view.</p>
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
                  <div key={ward.name} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                    <div
                      onClick={() => toggleWard(userScope.lga, ward.name)}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-slate-50 cursor-pointer transition-all select-none gap-4"
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`p-1.5 rounded-md ${isWardOpen ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-500'}`}>
                          <svg className={`w-4 h-4 transition-transform ${isWardOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                        </div>
                        <div>
                          <h5 className="text-base font-bold text-slate-800">{ward.name} Ward</h5>
                          <span className="text-xs text-slate-500 font-medium mt-0.5 block">
                            {totalWardExpectedPus} Polling Units
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col w-full sm:w-64 space-y-2 sm:text-right">
                        <div className="flex justify-between text-xs font-semibold text-slate-600">
                          <span>Reporting Progress:</span>
                          <span className="text-slate-900">{totalWardReportedPus} / {totalWardExpectedPus} ({wardIngestionRatio.toFixed(0)}%)</span>
                        </div>
                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-[#9A6749] h-full rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(wardIngestionRatio, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {isWardOpen && (
                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 border-t border-slate-200">
                        {localizedPus.length === 0 ? (
                          <div className="flex items-center space-x-2 text-sm text-slate-500 col-span-2 py-2">
                            <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                            <span>Loading polling units...</span>
                          </div>
                        ) : (
                          localizedPus.map(pu => {
                            const puCode = pu.code || pu.polling_unit_code;
                            const auditRecord = getPollingUnitAuditRecord(puCode);
                            const results = auditRecord ? auditRecord.results : null;
                            const hasData = results && typeof results === 'object' && Object.keys(results).length > 0;
                            const documentImgUrl = auditRecord ? auditRecord.image_url : null;

                            // Determine maximum votes for this specific unit
                            const maxPuVotes = hasData ? Math.max(...Object.values(results).map(Number)) : 0;

                            return (
                              <div
                                key={pu.id || puCode || pu.name}
                                className={`p-4 border rounded-xl flex flex-col justify-between space-y-4 transition-all ${hasData
                                  ? 'bg-white border-slate-300 shadow-sm'
                                  : 'bg-white border-dashed border-slate-200 opacity-75'
                                  }`}
                              >
                                <div className="flex justify-between items-start gap-3">
                                  <div>
                                    <span className="block text-xs font-bold text-slate-400 mb-1">
                                      Code: {puCode || 'N/A'}
                                    </span>
                                    <h6 className="text-sm font-semibold text-slate-800 leading-snug">
                                      {pu.name}
                                    </h6>
                                  </div>
                                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-md whitespace-nowrap ${hasData ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                    {hasData ? 'Results Verified' : 'Awaiting Agent'}
                                  </span>
                                </div>

                                <div className={`rounded-lg p-3 border ${hasData ? 'bg-slate-50 border-slate-100' : 'bg-transparent border-transparent'}`}>
                                  {hasData && <span className="block text-xs font-semibold text-slate-500 mb-2">SUBMITTED SCORES:</span>}
                                  {hasData ? (
                                    <div className="space-y-3">
                                      <div className="grid grid-cols-2 gap-2">
                                        {Object.entries(results).map(([party, value]) => {
                                          const isLeading = Number(value) === maxPuVotes && maxPuVotes > 0;
                                          return (
                                            <div key={party} className={`flex justify-between items-center px-2.5 py-1.5 border rounded-md ${isLeading ? 'bg-green-50 border-green-500 text-green-800 font-bold' : 'bg-white border-slate-200 text-slate-700 font-medium'}`}>
                                              <span className="text-sm">{party}</span>
                                              <div className="flex items-center space-x-1">
                                                <span className="text-sm">{value}</span>
                                                {isLeading && <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>

                                      {documentImgUrl && (
                                        <button
                                          type="button"
                                          onClick={() => setActiveLightboxUrl(documentImgUrl)}
                                          className="w-full mt-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold py-2 px-3 border border-slate-300 rounded-md transition-colors duration-150 flex items-center justify-center space-x-2"
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                          </svg>
                                          <span>Verify Sheet Document</span>
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="block text-sm text-slate-400 font-medium italic">
                                      No returns filed yet.
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4 transition-opacity duration-200"
          onClick={() => setActiveLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setActiveLightboxUrl(null)}
            className="absolute top-4 right-4 text-white hover:text-slate-200 bg-white/10 hover:bg-white/20 p-2.5 rounded-full transition-colors duration-150 focus:outline-none"
            title="Close Preview"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div
            className="relative max-w-3xl max-h-[85vh] w-full bg-white rounded-xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <span className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>Official Verification Sheet View</span>
              </span>
              <span className="text-xs font-semibold text-slate-500 bg-slate-200 px-2.5 py-1 rounded-md uppercase">
                Read-Only
              </span>
            </div>

            <div className="flex-1 bg-slate-100 flex items-center justify-center p-4 min-h-0 overflow-auto">
              <img
                src={activeLightboxUrl}
                alt="Official Electoral Verification Sheet Document"
                className="max-w-full max-h-[70vh] object-contain select-none shadow-sm rounded-lg bg-white"
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