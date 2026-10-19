'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Shield, Server, RefreshCw, Zap, Search, Globe,
    ChevronDown, ChevronRight, Activity, Clock,
    ChevronLeft, Filter, List, Database, Sun, Moon, User, Tag, Monitor, Lock, Settings, Link, CheckCircle
} from 'lucide-react';
import { generateIpRange, isIpInRange, cidrToRange } from '@/utils/ip-utils';

export default function Home() {
    const [data, setData] = useState({ vlans: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [vlanIps, setVlanIps] = useState({});
    const [expandedGroups, setExpandedGroups] = useState({});
    const [expandedVlans, setExpandedVlans] = useState({});

    // Global IP Search Results
    const [globalScanResult, setGlobalScanResult] = useState(null);
    const [isGlobalScanning, setIsGlobalScanning] = useState(false);

    // Auth State
    const [user, setUser] = useState(null);

    // Pagination State
    const [zonePages, setZonePages] = useState({});
    const ITEMS_PER_PAGE = 10;
    const [ipPages, setIpPages] = useState({});
    const [customIpLimits, setCustomIpLimits] = useState({});
    const [openLimitDropdowns, setOpenLimitDropdowns] = useState({});
    const DEFAULT_IP_ITEMS_PER_PAGE = 5;

    // Tab State
    const [activeTab, setActiveTab] = useState('combined');
    const [isTabLoaded, setIsTabLoaded] = useState(false);
    // Marks when the USER explicitly changed the tab (vs. system restoring from localStorage)
    const userChangedTab = useRef(false);
    // Tracks if hostnames have been fetched at least once this session (to avoid stale errors)
    const hostnamesFetched = useRef(false);

    const handleTabChange = (tab) => {
        userChangedTab.current = true;
        setActiveTab(tab);
    };

    // Hostname State
    const [hostnames, setHostnames] = useState([]);
    const [hostnameLoading, setHostnameLoading] = useState(false);
    const [hostnameError, setHostnameError] = useState(null);
    const [hostnameSearch, setHostnameSearch] = useState('');
    const [hostnameSituacao, setHostnameSituacao] = useState('todos');
    const [hostnamePadrao, setHostnamePadrao] = useState('todos');
    const [hostnameLetra, setHostnameLetra] = useState('todos');
    const [hostnamePais, setHostnamePais] = useState('todos');
    const [hostnamePage, setHostnamePage] = useState(1);
    const HOSTNAME_PAGE_SIZE = 50;

    // UI States
    const [theme, setTheme] = useState('dark');
    const [selectedZone, setSelectedZone] = useState('');
    const [selectedVlanId, setSelectedVlanId] = useState('');
    const [randomCount, setRandomCount] = useState(1);
    const [sortedIps, setSortedIps] = useState([]);
    const [statusModal, setStatusModal] = useState({ open: false, ip: '', currentStatus: '' });
    const [statusPassword, setStatusPassword] = useState('');
    const [statusTarget, setStatusTarget] = useState('Reservado');
    const [selectionError, setSelectionError] = useState(null);
    const [selectionSuccess, setSelectionSuccess] = useState(null);
    const [blinkingFields, setBlinkingFields] = useState({ zone: false, vlan: false });
    const [ipHistory, setIpHistory] = useState([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);

    // Hostname Status States
    const [hostnameManualStatuses, setHostnameManualStatuses] = useState({});
    const [hostnameRandomCount, setHostnameRandomCount] = useState(1);
    const [hostnameSortedKeys, setHostnameSortedKeys] = useState([]);
    const [hostnameStatusModal, setHostnameStatusModal] = useState({ open: false, key: '', currentStatus: '', name: '' });
    const [hostnameHistory, setHostnameHistory] = useState([]);
    const [isHostnameHistoryLoading, setIsHostnameHistoryLoading] = useState(false);
    const [hostnameStatusTarget, setHostnameStatusTarget] = useState('Reservado');
    const [isCooldown, setIsCooldown] = useState(false);
    const [historyPage, setHistoryPage] = useState(1);
    const HISTORY_PER_PAGE = 5;
    const [hostnameModalError, setHostnameModalError] = useState(null);
    // Feedback messages specific to the Nomes de Ativo tab
    const [hostnameTabSuccess, setHostnameTabSuccess] = useState(null);
    const [hostnameTabError, setHostnameTabError] = useState(null);

    // Combined Sorter State
    const [combinedZone, setCombinedZone] = useState('');
    const [combinedVlanId, setCombinedVlanId] = useState('');
    const [combinedResult, setCombinedResult] = useState(null); // { ip, hostname }
    const [combinedLoading, setCombinedLoading] = useState(false);
    const [combinedError, setCombinedError] = useState(null);
    const [combinedSuccess, setCombinedSuccess] = useState(null);
    const [combinedConfirmModal, setCombinedConfirmModal] = useState(false);
    const [combinedPassword, setCombinedPassword] = useState('');
    const [combinedConfirmLoading, setCombinedConfirmLoading] = useState(false);
    const [combinedAction, setCombinedAction] = useState('Em Uso'); // 'Em Uso' or 'Reservado'

    // Global History State
    const [globalHistory, setGlobalHistory] = useState([]);
    const [globalHistoryLoading, setGlobalHistoryLoading] = useState(false);
    const [historyTimeRange, setHistoryTimeRange] = useState('3months');
    const [historyTypeFilter, setHistoryTypeFilter] = useState('todos');
    const [historyStatusFilter, setHistoryStatusFilter] = useState('todos');
    const [globalHistoryPage, setGlobalHistoryPage] = useState(1);
    const [globalHistoryPerPage, setGlobalHistoryPerPage] = useState(10);
    const [lastScanInfo, setLastScanInfo] = useState(null);

    const [config, setConfig] = useState({
        appName: 'Gerenciador de IPs e DNS',
        appSubtitle: 'Gestão Integrada de IPs, DNS e Inventário CMDB',
        companyName: 'Minha Empresa'
    });

    // Memos
    const uniqueZones = useMemo(() => {
        const zones = data.vlans.map(v => v.securityZone || 'Outras');
        return [...new Set(zones)].sort();
    }, [data.vlans]);

    const zoneVlansList = useMemo(() => {
        if (!selectedZone) return [];
        return data.vlans.filter(v => (v.securityZone || 'Outras') === selectedZone);
    }, [data.vlans, selectedZone]);

    const totalVlans = useMemo(() => data.vlans.length, [data.vlans]);

    // Grouping logic for IPs tab
    const groupedVlans = useMemo(() => {
        const lowerSearch = searchTerm.toLowerCase();
        const filtered = data.vlans.filter(vlan => {
            // Match against VLAN metadata
            if (vlan.name.toLowerCase().includes(lowerSearch) ||
                (vlan.securityZone || '').toLowerCase().includes(lowerSearch) ||
                vlan.range.includes(searchTerm)) return true;

            // Match against IPs in cache if we have them
            const ips = vlanIps[String(vlan.id)];
            if (ips) {
                return Object.values(ips).some(info =>
                    (info.dns || '').toLowerCase().includes(lowerSearch)
                );
            }
            return false;
        });

        const groups = {};
        filtered.forEach(vlan => {
            const zone = (vlan.securityZone === '-' || !vlan.securityZone) ? 'Outras' : vlan.securityZone;
            if (!groups[zone]) groups[zone] = [];
            groups[zone].push(vlan);
        });

        const sortedGroups = {};
        Object.keys(groups).sort((a, b) => {
            if (a === 'Outras') return 1;
            if (b === 'Outras') return -1;
            return a.localeCompare(b);
        }).forEach(key => sortedGroups[key] = groups[key]);

        return sortedGroups;
    }, [data.vlans, searchTerm]);

    const alphabet = useMemo(() => ['todos', '#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')], []);

    const filteredHostnames = useMemo(() => {
        let result = hostnames;

        if (hostnameSearch) {
            const query = hostnameSearch.toLowerCase().trim();
            result = result.filter(h =>
                h.name.toLowerCase().includes(query) ||
                h.key.toLowerCase().includes(query) ||
                (h.descricao || '').toLowerCase().includes(query)
            );
        }

        if (hostnameSituacao !== 'todos') {
            result = result.filter(h => {
                const manual = hostnameManualStatuses[h.key];
                const status = (manual ? manual.status : h.situacao) || '';
                const s = status.toLowerCase();
                const t = hostnameSituacao.toLowerCase();

                if (t === 'em uso') return s.includes('uso') || s.includes('busy') || s.includes('taken');
                if (t === 'disponível') return s.includes('dispon') || s.includes('free') || s.includes('available') || s.includes('livre');
                if (t === 'reservado') return s.includes('reserv') || s.includes('booked');

                return s.includes(t);
            });
        }

        if (hostnamePadrao !== 'todos') {
            result = result.filter(h => {
                const p = (h.padronizacao || '').toLowerCase();
                if (hostnamePadrao === 'Padronizado') {
                    // Aceita "Padrão", "Padronizado" ou "Sim"
                    return p.includes('padr') && !p.includes('fora');
                } else if (hostnamePadrao === 'Fora de Padrão') {
                    // Aceita "Fora de Padrão" ou "Não"
                    return p.includes('fora');
                }
                return p === hostnamePadrao.toLowerCase();
            });
        }

        if (hostnamePais !== 'todos') {
            result = result.filter(h => h.pais === hostnamePais);
        }

        if (hostnameLetra !== 'todos') {
            if (hostnameLetra === '#') {
                result = result.filter(h => !/^[a-zA-Z]/.test(h.name));
            } else {
                result = result.filter(h => h.name.toUpperCase().startsWith(hostnameLetra));
            }
        }

        return [...result].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [hostnames, hostnameSearch, hostnameSituacao, hostnamePadrao, hostnamePais, hostnameLetra, hostnameManualStatuses]);

    const paginatedHostnames = useMemo(() => {
        const start = (hostnamePage - 1) * HOSTNAME_PAGE_SIZE;
        return filteredHostnames.slice(start, start + HOSTNAME_PAGE_SIZE);
    }, [filteredHostnames, hostnamePage]);

    const totalHostnamePages = Math.ceil(filteredHostnames.length / HOSTNAME_PAGE_SIZE);

    const paginatedGlobalHistory = useMemo(() => {
        const start = (globalHistoryPage - 1) * globalHistoryPerPage;
        return globalHistory.slice(start, start + globalHistoryPerPage);
    }, [globalHistory, globalHistoryPage, globalHistoryPerPage]);

    const totalGlobalHistoryPages = Math.ceil(globalHistory.length / globalHistoryPerPage);

    const uniquePais = useMemo(() => {
        const paises = hostnames.map(h => h.pais).filter(p => p && p !== '-');
        return [...new Set(paises)].sort();
    }, [hostnames]);


    const hasInitialHostnamesLoad = useRef(false);

    const fetchScanStatus = async () => {
        try {
            const res = await fetch('/api/admin/scan-status');
            if (res.ok) {
                const info = await res.json();
                setLastScanInfo(info);
            }
        } catch (e) { }
    };

    useEffect(() => {
        fetchScanStatus();
        // Dynamic interval: check more often if a scan is running
        const pollingInterval = (lastScanInfo && lastScanInfo.isRunning) ? 5000 : 30000;
        const interval = setInterval(fetchScanStatus, pollingInterval);
        return () => clearInterval(interval);
    }, [lastScanInfo?.isRunning]);

    const fetchGlobalHistory = async () => {
        setGlobalHistoryLoading(true);
        try {
            const params = new URLSearchParams({
                timeRange: historyTimeRange,
                type: historyTypeFilter,
                status: historyStatusFilter,
                limit: 500
            });
            const res = await fetch(`/api/history?${params.toString()}`);
            const data = await res.json();
            if (res.ok) setGlobalHistory(data);
        } catch (err) {
            console.error('Failed to fetch global history:', err);
        } finally {
            setGlobalHistoryLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'history') {
            setGlobalHistoryPage(1);
            fetchGlobalHistory();
        }
    }, [activeTab, historyTimeRange, historyTypeFilter, historyStatusFilter]);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const res = await fetch('/api/config');
                if (res.ok) setConfig(await res.json());
            } catch (err) { console.error('Failed to fetch config:', err); }
        };
        fetchConfig();
        const savedTheme = localStorage.getItem('theme') || 'dark';
        setTheme(savedTheme);
        document.body.setAttribute('data-theme', savedTheme);

        // Tab Persistence - restore saved tab WITHOUT triggering hostname fetch side-effects
        // (userChangedTab.current stays false, so the useEffect guards below will skip)
        const savedTab = localStorage.getItem('activeTab') || 'combined';
        setActiveTab(savedTab);
        setIsTabLoaded(true);

        fetchData();
        checkAuth();

        const handleClickOutside = (e) => {
            if (!e.target.closest('.limit-control')) setOpenLimitDropdowns({});
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    useEffect(() => {
        if (isTabLoaded) {
            localStorage.setItem('activeTab', activeTab);
        }
    }, [activeTab, isTabLoaded]);

    useEffect(() => {
        // Only fetch when the USER navigated to this tab (not on localStorage restoration)
        if (!userChangedTab.current) return;
        userChangedTab.current = false;

        // Clear stale error when user manually changes tab
        setHostnameError(null);

        if (activeTab === 'hostnames') {
            if (hostnames.length === 0 && !hostnameLoading) {
                hasInitialHostnamesLoad.current = true;
                hostnamesFetched.current = true;
                fetchHostnamesData();
                fetchHostnameManualStatuses();
            }
        } else if (activeTab === 'combined') {
            if (hostnames.length === 0 && !hostnameLoading && !isCooldown) {
                hostnamesFetched.current = true;
                fetchHostnamesData();
            }
        }
    }, [activeTab]);

    useEffect(() => {
        const query = searchTerm.trim();
        if (query) {
            setCombinedResult(null);
            setSortedIps([]);
            setHostnameSortedKeys([]);
        }
        if (/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(query)) {
            performGlobalSearch(query);
        } else if (query.length >= 3 && !query.includes('.')) {
            performGlobalHostnameSearch(query);
        } else {
            setGlobalScanResult(null);
        }
    }, [searchTerm, data.vlans]);

    useEffect(() => {
        // Se houver VLANs expandidas mas sem dados de IP (ex: após um Refresh), recarrega
        Object.keys(expandedVlans).forEach(id => {
            if (expandedVlans[id] && (!vlanIps[id] || Object.keys(vlanIps[id]).length === 0)) {
                const vlan = data.vlans.find(v => String(v.id) === id);
                if (vlan) handleVlanExpansion(vlan);
            }
        });
    }, [expandedVlans, vlanIps, data.vlans]);

    const performGlobalHostnameSearch = async (hostname) => {
        setIsGlobalScanning(true);
        try {
            const res = await fetch('/api/resolve', {
                method: 'POST',
                body: JSON.stringify({ hostname: hostname.toLowerCase() }),
                headers: { 'Content-Type': 'application/json' }
            });
            if (!res.ok) return;

            const { ip } = await res.json();
            if (!ip) return;

            // Internal VLAN check
            const isInternal = data.vlans.some(v => {
                let s = v.initialIp, e = v.finalIp;
                if (!s || s === '-') s = v.range.split('/')[0];
                if (!e || e === '-') e = s;
                return isIpInRange(ip, s, e);
            });

            if (isInternal) {
                performGlobalSearch(ip);
            } else {
                setGlobalScanResult(null);
            }
        } catch (err) {
            console.error('Hostname Search Error:', err);
        } finally {
            setIsGlobalScanning(false);
        }
    };

    const triggerGlobalRescan = async () => {
        try {
            await fetch('/api/admin/scan-all', { method: 'POST' });
            setSelectionSuccess('Varredura global iniciada em segundo plano. Status e correções serão atualizados gradualmente.');
            setTimeout(() => setSelectionSuccess(null), 8000);
        } catch (err) {
            console.error('Failed to trigger scan:', err);
        }
    };

    // Core Data Fetchers
    const fetchData = async (force = false) => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`/api/jira${force ? '?force=true' : ''}`);
            if (!response.ok) throw new Error('Falha ao buscar dados do Jira');
            const result = await response.json();
            setData(result);

            if (force) {
                fetchHostnameManualStatuses();

                // Prioriza as VLANs que estão abertas na tela
                const expandedIds = Object.keys(expandedVlans).filter(id => expandedVlans[id]);

                for (const id of expandedIds) {
                    const vlan = result.vlans.find(v => String(v.id) === id);
                    if (vlan) {
                        // Força a re-geração da lista de IPs e busca no cache mais recente
                        await handleVlanExpansion(vlan, true);
                    }
                }
            }
        } catch (err) { setError(err.message); } finally { setLoading(false); }
    };

    const fetchHostnamesData = async (force = false) => {
        if (hostnameLoading || isCooldown) return;
        setHostnameLoading(true);
        setHostnameError(null);
        try {
            const res = await fetch(`/api/hostnames${force ? '?force=true' : ''}`);
            if (!res.ok) throw new Error('Falha ao buscar Nomes de Ativo');
            const result = await res.json();
            setHostnames(result.hostnames || []);
            setHostnamePage(1);

            // Refetch manual statuses in case the force reload triggered corrections
            if (force) {
                fetchHostnameManualStatuses();
            }

            // Se não foi um force reload, coloca um cooldown de 10s para evitar re-requests acidentais ao trocar de aba
            if (!force) {
                setIsCooldown(true);
                setTimeout(() => setIsCooldown(false), 10000);
            }
        } catch (err) { setHostnameError(err.message); } finally { setHostnameLoading(false); }
    };

    const checkAuth = async () => {
        try {
            const res = await fetch('/api/auth/me');
            if (res.ok) {
                const data = await res.json();
                setUser(data.user);
            }
        } catch (err) { console.error('Auth check error:', err); }
    };

    const fetchHostnameManualStatuses = async () => {
        try {
            const res = await fetch('/api/hostname-status');
            if (res.ok) setHostnameManualStatuses(await res.json());
        } catch (err) { console.error('Failed to fetch hostname manual statuses:', err); }
    };

    // UI Handlers
    const toggleTheme = () => {
        const newTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    };

    const handleLogout = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.href = '/login';
        } catch (err) { console.error('Logout error:', err); }
    };

    const navigateToZone = (vlan, targetIp = null) => {
        const zoneName = (vlan.securityZone === '-' || !vlan.securityZone) ? 'Outras' : vlan.securityZone;

        // Ensure search is cleared immediately
        setSearchTerm('');

        // Find the correct page index in the UNFILTERED list for this zone
        const zoneVlansFull = data.vlans.filter(v => {
            const z = (v.securityZone === '-' || !v.securityZone) ? 'Outras' : v.securityZone;
            return z === zoneName;
        });

        const vlanIndex = zoneVlansFull.findIndex(v => String(v.id) === String(vlan.id));
        if (vlanIndex !== -1) {
            setZonePages(prev => ({ ...prev, [zoneName]: Math.ceil((vlanIndex + 1) / ITEMS_PER_PAGE) }));
        }

        setExpandedGroups({ [zoneName]: true });
        setExpandedVlans({ [String(vlan.id)]: true });
        handleVlanExpansion(vlan);

        if (targetIp) {
            setSortedIps([targetIp]);
            // Calculate IP page
            const limit = customIpLimits[String(vlan.id)] || 5;
            // We need the full IP list to find index. If not loaded, indices might be off, 
            // but generateIpRange gives them in order.
            const allIps = generateIpRange(vlan.initialIp, vlan.finalIp);
            const ipIndex = allIps.indexOf(targetIp);
            if (ipIndex !== -1) {
                const page = Math.floor(ipIndex / limit) + 1;
                setIpPages(prev => ({ ...prev, [String(vlan.id)]: page }));
            }
        }

        setTimeout(() => {
            if (targetIp) {
                const rows = document.querySelectorAll('.ip-row');
                const targetRow = Array.from(rows).find(row => row.querySelector('.ip-cell')?.textContent === targetIp);
                if (targetRow) {
                    targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    targetRow.classList.add('highlight-flash');
                    setTimeout(() => targetRow.classList.remove('highlight-flash'), 5000);
                    return;
                }
            }

            const element = document.getElementById(`vlan-card-${vlan.id}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                element.classList.add('highlight-flash');
                setTimeout(() => element.classList.remove('highlight-flash'), 2500);
            }
        }, targetIp ? 800 : 300);
    };

    const toggleGroup = (zone) => {
        setExpandedGroups(prev => ({ [zone]: !prev[zone] }));
        if (!zonePages[zone]) setZonePages(prev => ({ ...prev, [zone]: 1 }));
    };

    const handleVlanExpansion = async (vlan, force = false) => {
        let start = vlan.initialIp;
        let end = vlan.finalIp;

        if (start) start = start.toString().trim();
        if (end) end = end.toString().trim();

        if ((!start || start === '-' || !end || end === '-') && vlan.range) {
            const calculated = cidrToRange(vlan.range);
            if (!start || start === '-') start = calculated.start;
            if (!end || end === '-') end = calculated.end;
        } else if (!end || end === '-') end = start;

        if (typeof start === 'string' && start.includes('/')) start = start.split('/')[0].trim();
        if (typeof end === 'string' && end.includes('/')) end = end.split('/')[0].trim();

        const ips = generateIpRange(start, end, 512);
        if (ips.length === 0) return {};

        const nextMap = {};
        setVlanIps(prev => {
            const current = prev[String(vlan.id)] || {};
            if (!force && Object.keys(current).length > 0) return prev;

            ips.forEach(ip => {
                nextMap[ip] = {
                    status: current[ip]?.status || 'Desconhecido',
                    dns: current[ip]?.dns || '-',
                    loading: force, // Only show individual loading if forced
                    online: current[ip]?.online,
                    manual: current[ip]?.manual
                };
            });
            return { ...prev, [String(vlan.id)]: nextMap };
        });

        // Populate nextMap for early return/use if we have cached results
        try {
            const batchSize = 50;
            for (let i = 0; i < ips.length; i += batchSize) {
                const batch = ips.slice(i, i + batchSize);
                const response = await fetch(`/api/scan?ips=${batch.join(',')}`);
                if (response.ok) {
                    const cachedResults = await response.json();
                    if (Object.keys(cachedResults).length > 0) {
                        setVlanIps(prev => {
                            const currentVlanData = { ...(prev[String(vlan.id)] || nextMap) };
                            Object.entries(cachedResults).forEach(([ip, result]) => {
                                currentVlanData[ip] = { status: result.status, dns: result.dns, loading: false, online: result.online, manual: result.manual };
                                if (nextMap[ip]) {
                                    nextMap[ip] = { ...nextMap[ip], ...currentVlanData[ip] };
                                }
                            });
                            return { ...prev, [String(vlan.id)]: currentVlanData };
                        });
                    }
                }
            }
        } catch (err) { console.error('Cache load error:', err); }
        return nextMap;
    };

    const scanIP = async (vlanId, ip) => {
        setVlanIps(prev => ({ ...prev, [String(vlanId)]: { ...prev[String(vlanId)], [ip]: { ...prev[String(vlanId)][ip], loading: true } } }));
        try {
            const res = await fetch('/api/scan', {
                method: 'POST',
                body: JSON.stringify({ ip, force: true }),
                headers: { 'Content-Type': 'application/json' }
            });
            const result = await res.json();
            setVlanIps(prev => ({
                ...prev, [String(vlanId)]: {
                    ...prev[String(vlanId)], [ip]: { status: result.status, dns: result.dns, loading: false, online: result.online, manual: result.manual }
                }
            }));
        } catch (err) {
            setVlanIps(prev => ({ ...prev, [String(vlanId)]: { ...prev[String(vlanId)], [ip]: { ...prev[String(vlanId)][ip], loading: false, status: 'Error' } } }));
        }
    };

    const scanAll = async (vlanId, optionalIps = null) => {
        const ips = optionalIps || Object.keys(vlanIps[vlanId] || {});
        if (ips.length === 0) return;

        // Set all to loading
        setVlanIps(prev => {
            const current = { ...prev[String(vlanId)] };
            ips.forEach(ip => { if (current[ip]) current[ip].loading = true; });
            return { ...prev, [String(vlanId)]: current };
        });

        const batchSize = 30; // Perform 30 pings at once via batch API
        for (let i = 0; i < ips.length; i += batchSize) {
            const batch = ips.slice(i, i + batchSize);
            try {
                const res = await fetch('/api/scan', {
                    method: 'POST',
                    body: JSON.stringify({ ips: batch, force: true }),
                    headers: { 'Content-Type': 'application/json' }
                });

                if (res.ok) {
                    const batchResults = await res.json();
                    setVlanIps(prev => {
                        const current = { ...prev[String(vlanId)] };
                        Object.entries(batchResults).forEach(([ip, result]) => {
                            if (current[ip]) {
                                current[ip] = {
                                    status: result.status,
                                    dns: result.dns,
                                    loading: false,
                                    online: result.online,
                                    manual: result.manual
                                };
                            }
                        });
                        return { ...prev, [String(vlanId)]: current };
                    });
                } else {
                    const errorData = await res.json().catch(() => ({ error: 'Desconhecido' }));
                    setVlanIps(prev => {
                        const current = { ...prev[String(vlanId)] };
                        batch.forEach(ip => {
                            if (current[ip]) {
                                current[ip].loading = false;
                                current[ip].status = res.status === 503 ? 'Servidor Ocupado' : 'Erro na Busca';
                            }
                        });
                        return { ...prev, [String(vlanId)]: current };
                    });
                }
            } catch (err) {
                console.error('Batch scan error:', err);
            }
        }

        // Ensure all loading icons are cleared if some failed
        setVlanIps(prev => {
            const current = { ...prev[String(vlanId)] };
            ips.forEach(ip => { if (current[ip]) current[ip].loading = false; });
            return { ...prev, [String(vlanId)]: current };
        });
    };

    const performGlobalSearch = async (ip) => {
        setIsGlobalScanning(true);
        try {
            const parentZone = data.vlans.find(v => {
                let s = v.initialIp, e = v.finalIp;
                if (!s || s === '-') s = v.range.split('/')[0];
                if (!e || e === '-') e = s;
                return isIpInRange(ip, s, e);
            });
            const res = await fetch('/api/scan', { method: 'POST', body: JSON.stringify({ ip, force: true }), headers: { 'Content-Type': 'application/json' } });
            const result = await res.json();
            setGlobalScanResult({ ip, status: result.status, dns: result.dns, online: result.online, zone: parentZone || { name: 'Desconhecida', securityZone: 'N/A' } });
        } catch (err) { console.error('Global Search Error:', err); } finally { setIsGlobalScanning(false); }
    };

    const validateSelection = () => {
        const errors = { zone: !selectedZone, vlan: !selectedVlanId };
        if (errors.zone || errors.vlan) {
            setSelectionError(`Por favor, selecione a ${errors.zone ? 'Zona de Segurança' : 'VLAN'} antes de prosseguir.`);
            setSelectionSuccess(null);
            setBlinkingFields(errors);
            setTimeout(() => setBlinkingFields({ zone: false, vlan: false }), 2000);
            return false;
        }
        setSelectionError(null);
        return true;
    };

    const handleGetIps = () => {
        if (!validateSelection()) return;
        setSortedIps([]);
        setSelectionSuccess(null);
        const vlan = data.vlans.find(v => String(v.id) === String(selectedVlanId));
        if (vlan) navigateToZone(vlan);
    };

    const handleRandomize = async () => {
        if (!validateSelection()) return;
        const vlan = data.vlans.find(v => String(v.id) === String(selectedVlanId));
        if (!vlan) return;

        setSelectionSuccess(null);
        let currentIps = vlanIps[String(vlan.id)];

        if (!currentIps || Object.keys(currentIps).length === 0) {
            setSelectionError("Carregando IPs da VLAN...");
            currentIps = await handleVlanExpansion(vlan);
        }

        if (!currentIps || Object.keys(currentIps).length === 0) {
            setSelectionError("Falha ao carregar IPs da VLAN.");
            return;
        }

        const freeIps = Object.entries(currentIps)
            .filter(([ip, info]) => {
                const s = info.status ? info.status.toLowerCase() : '';
                // Considera 'free' e 'unknown' como disponíveis para sorteio, 
                // já que a varredura não é em tempo real
                return s === 'free' || s === 'unknown' || s.includes('disponível') || s.includes('livre') || s.includes('available');
            })
            .map(([ip]) => ip);

        if (freeIps.length === 0) {
            setSelectionError('Nenhum IP disponível nesta VLAN.');
            return;
        }

        // Sort IPs numerically to find closest ones
        const sortedFree = [...freeIps].sort((a, b) => {
            const aOct = a.split('.').map(Number);
            const bOct = b.split('.').map(Number);
            for (let i = 0; i < 4; i++) if (aOct[i] !== bOct[i]) return aOct[i] - bOct[i];
            return 0;
        });

        const count = Math.min(randomCount, sortedFree.length);
        let picked = [];

        if (count === 1) {
            picked = [sortedFree[Math.floor(Math.random() * sortedFree.length)]];
        } else {
            // Find group(s) with minimum spread (distance between first and last IP)
            const ipToNum = (ip) => ip.split('.').reduce((acc, octet) => (acc * 256) + parseInt(octet), 0);
            let bestGroups = [];
            let minSpread = Infinity;

            for (let i = 0; i <= sortedFree.length - count; i++) {
                const group = sortedFree.slice(i, i + count);
                const spread = ipToNum(group[group.length - 1]) - ipToNum(group[0]);
                if (spread < minSpread) {
                    minSpread = spread;
                    bestGroups = [group];
                } else if (spread === minSpread) {
                    bestGroups.push(group);
                }
            }
            picked = bestGroups[Math.floor(Math.random() * bestGroups.length)];
        }

        const firstPickedIp = picked[0];
        const allIps = Object.keys(currentIps); // Insertion order = numerical order from generateIpRange
        const ipIndex = allIps.indexOf(firstPickedIp);
        const limit = customIpLimits[String(vlan.id)] || 5;
        const page = Math.floor(ipIndex / limit) + 1;

        setSortedIps(picked);
        setSelectionError(null);
        setSelectionSuccess(`Sorteado(s) com sucesso: ${picked.join(', ')}`);

        // Ensure IP page is correct for the selected range
        setIpPages(prev => ({ ...prev, [String(vlan.id)]: page }));

        navigateToZone(vlan);

        // Scroll to the first picked IP and highlight ALL picked IPs
        if (picked.length > 0) {
            setTimeout(() => {
                const rows = document.querySelectorAll('.ip-row');
                picked.forEach((ip, idx) => {
                    const targetRow = Array.from(rows).find(row => row.querySelector('.ip-cell')?.textContent === ip);
                    if (targetRow) {
                        if (idx === 0) targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        targetRow.classList.add('highlight-flash');
                        setTimeout(() => targetRow.classList.remove('highlight-flash'), 5000);
                    }
                });
            }, 600);
        }
    };

    const fetchIpHistory = async (ip) => {
        setIsHistoryLoading(true);
        try {
            const res = await fetch(`/api/ip-status?ip=${ip}`);
            if (res.ok) {
                setIpHistory(await res.json());
            }
        } catch (err) {
            console.error('Failed to fetch history:', err);
        } finally {
            setIsHistoryLoading(false);
        }
    };

    const handleOpenStatusModal = (ip, status) => {
        setStatusModal({ open: true, ip, currentStatus: status });
        setIpHistory([]);
        setSelectionError(null); // Clear main error
        setSelectionSuccess(null);
        fetchIpHistory(ip);
    };

    const handleStatusUpdate = async (e) => {
        if (e) e.preventDefault();
        setSelectionError(null);
        setSelectionSuccess(null);

        const finalStatus = statusTarget === 'Livre (Remover Manual)' ? 'Disponível' : statusTarget;

        try {
            const res = await fetch('/api/ip-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ip: statusModal.ip, status: finalStatus })
            });

            if (!res.ok) {
                const errData = await res.json();
                setSelectionError(errData.error || 'Falha ao atualizar status');
                return;
            }

            const result = await res.json();
            Object.keys(vlanIps).forEach(vId => {
                if (vlanIps[vId][statusModal.ip]) {
                    setVlanIps(prev => ({
                        ...prev, [vId]: { ...prev[vId], [statusModal.ip]: { ...prev[vId][statusModal.ip], status: finalStatus, manual: result.result } }
                    }));
                }
            });
            setStatusModal({ open: false, ip: '', currentStatus: '' });
            setStatusPassword('');
            setSelectionSuccess(`Status do IP ${statusModal.ip} atualizado para ${finalStatus} com sucesso!`);
        } catch (err) {
            setSelectionError(err.message);
        }
    };

    const handleHostnameRandomize = () => {
        if (hostnameLoading && hostnames.length === 0) {
            setHostnameError('Aguarde o carregamento inicial dos ativos...');
            return;
        }

        const available = hostnames.filter(h => {
            const manual = hostnameManualStatuses[h.key];
            const status = manual ? manual.status : h.situacao;
            // Pegar tanto Português como variações do sistema
            return status && (
                status.toLowerCase().includes('disponível') ||
                status.toLowerCase().includes('available') ||
                status.toLowerCase().includes('free')
            );
        }).map(h => h.key);

        if (available.length === 0) {
            setSelectionError(hostnames.length === 0 ? 'Carregando ativos do Jira...' : 'Nenhum hostname disponível para sorteio nos filtros atuais.');
            return;
        }

        const count = Math.min(hostnameRandomCount || 1, available.length);
        const shuffled = [...available].sort(() => 0.5 - Math.random());
        const picked = shuffled.slice(0, count);

        setHostnameSortedKeys(picked);
        setSelectionError(null);
        setSelectionSuccess(`Sorteado(s) com sucesso: ${picked.join(', ')}`);

        // Find and highlight ALL picked hostnames on the current page
        const firstKey = picked[0];
        const index = filteredHostnames.findIndex(h => h.key === firstKey);
        if (index !== -1) {
            setHostnamePage(Math.floor(index / HOSTNAME_PAGE_SIZE) + 1);
            setTimeout(() => {
                const rows = document.querySelectorAll('.hostname-row');
                picked.forEach((key, idx) => {
                    const element = Array.from(rows).find(row => row.querySelector('.key-cell')?.textContent === key);
                    if (element) {
                        if (idx === 0) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        element.classList.add('highlight-flash');
                        setTimeout(() => element.classList.remove('highlight-flash'), 5000);
                    }
                });
            }, 600);
        }
    };

    const fetchHostnameHistory = async (key) => {
        setIsHostnameHistoryLoading(true);
        try {
            const res = await fetch(`/api/hostname-status?key=${key}`);
            if (res.ok) setHostnameHistory(await res.json());
        } catch (err) { console.error('History error:', err); }
        finally { setIsHostnameHistoryLoading(false); }
    };

    const handleOpenHostnameStatusModal = (h) => {
        const manual = hostnameManualStatuses[h.key];
        setHostnameStatusModal({ open: true, key: h.key, currentStatus: manual ? manual.status : h.situacao, name: h.name });
        setHostnameHistory([]);
        setHistoryPage(1);
        setHostnameModalError(null);
        setSelectionError(null);
        setSelectionSuccess(null);
        fetchHostnameHistory(h.key);
    };

    const handleHostnameStatusUpdate = async (e) => {
        if (e) e.preventDefault();
        setHostnameModalError(null);
        try {
            const res = await fetch('/api/hostname-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: hostnameStatusModal.key, status: hostnameStatusTarget })
            });

            if (!res.ok) {
                const err = await res.json();
                setHostnameModalError(err.error || 'Falha ao atualizar status');
                return;
            }

            const result = await res.json();
            setHostnameManualStatuses(prev => ({ ...prev, [hostnameStatusModal.key]: result.result }));
            setStatusPassword('');
            setHistoryPage(1);
            setHostnameStatusModal(prev => ({ ...prev, open: false })); // Auto-close
            setHostnameTabSuccess(`Status de ${hostnameStatusModal.name || hostnameStatusModal.key} atualizado com sucesso!`);
            setHostnameTabError(null);
            setTimeout(() => setHostnameTabSuccess(null), 6000);
        } catch (err) { setHostnameModalError(err.message); }
    };

    // Combined Sorter Handlers
    const handleCombinedDraw = async () => {
        setCombinedError(null);
        setCombinedSuccess(null);
        setCombinedResult(null);
        if (!combinedVlanId) {
            setCombinedError('Selecione a Zona e a VLAN primeiro.');
            return;
        }
        setCombinedLoading(true);
        try {
            const vlan = data.vlans.find(v => String(v.id) === String(combinedVlanId));
            if (!vlan) throw new Error('VLAN não encontrada.');

            // Load IPs if needed
            let currentIps = vlanIps[String(vlan.id)];
            if (!currentIps || Object.keys(currentIps).length === 0) {
                currentIps = await handleVlanExpansion(vlan);
            }
            if (!currentIps || Object.keys(currentIps).length === 0) throw new Error('Falha ao carregar IPs da VLAN.');

            // Find free IPs
            const freeIps = Object.entries(currentIps)
                .filter(([, info]) => {
                    const s = (info.status || '').toLowerCase();
                    return !s.includes('uso') && !s.includes('reservado') && !s.includes('in use');
                })
                .map(([ip]) => ip)
                .sort((a, b) => {
                    const aO = a.split('.').map(Number);
                    const bO = b.split('.').map(Number);
                    for (let i = 0; i < 4; i++) if (aO[i] !== bO[i]) return aO[i] - bO[i];
                    return 0;
                });

            if (freeIps.length === 0) throw new Error('Nenhum IP disponível nesta VLAN.');

            // Find free hostnames
            const freeHostnames = hostnames.filter(h => {
                const manual = hostnameManualStatuses[h.key];
                const s = (manual ? manual.status : h.situacao || '').toLowerCase();
                return s.includes('disponível') || s.includes('free') || s.includes('available') || s.includes('livre');
            });

            if (freeHostnames.length === 0) throw new Error('Nenhum Nome de Ativo disponível. Carregue a aba "Nomes de Ativo" primeiro.');

            const randomIp = freeIps[Math.floor(Math.random() * freeIps.length)];
            const randomHostname = freeHostnames[Math.floor(Math.random() * freeHostnames.length)];

            setCombinedResult({ ip: randomIp, hostname: randomHostname, vlan });
        } catch (err) {
            setCombinedError(err.message);
        } finally {
            setCombinedLoading(false);
        }
    };

    const handleCombinedConfirm = async () => {
        if (!combinedResult) return;
        setCombinedConfirmLoading(true);
        setCombinedError(null);
        try {
            const [ipRes, hostnameRes] = await Promise.all([
                fetch('/api/ip-status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ip: combinedResult.ip, status: combinedAction })
                }),
                fetch('/api/hostname-status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: combinedResult.hostname.key, status: combinedAction })
                })
            ]);

            if (!ipRes.ok) {
                const e = await ipRes.json();
                throw new Error(e.error || 'Falha ao atualizar IP.');
            }
            if (!hostnameRes.ok) {
                const e = await hostnameRes.json();
                throw new Error(e.error || 'Falha ao atualizar Nome de Ativo.');
            }

            // Update local state
            const ipResult = await ipRes.json();
            const hostnameResult = await hostnameRes.json();

            setVlanIps(prev => {
                const vId = String(combinedResult.vlan.id);
                if (!prev[vId]?.[combinedResult.ip]) return prev;
                return { ...prev, [vId]: { ...prev[vId], [combinedResult.ip]: { ...prev[vId][combinedResult.ip], status: combinedAction, manual: ipResult.result } } };
            });
            setHostnameManualStatuses(prev => ({ ...prev, [combinedResult.hostname.key]: hostnameResult.result }));

            setCombinedSuccess(`✅ IP ${combinedResult.ip} e Nome "${combinedResult.hostname.name}" marcados como ${combinedAction} com sucesso!`);
            setCombinedConfirmModal(false);
            setCombinedPassword('');
            setCombinedResult(null);
        } catch (err) {
            setCombinedError(err.message);
        } finally {
            setCombinedConfirmLoading(false);
        }
    };

    // Rendering Helpers
    const toggleLimit = (vlanId) => setOpenLimitDropdowns(prev => ({ [vlanId]: !prev[vlanId] }));
    const toggleVlan = (vlan) => {
        const expand = !expandedVlans[String(vlan.id)];
        setExpandedVlans(expand ? { [String(vlan.id)]: true } : {});
        if (expand) handleVlanExpansion(vlan);
    };

    return (
        <div className="container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <header className="page-header">
                <div>
                    <h1>{config.appName}</h1>
                    <p className="subtitle">{config.appSubtitle}</p>
                </div>
                <div className="header-actions">
                    {lastScanInfo && (
                        <div className="last-scan-header" style={{
                            fontSize: '0.75rem',
                            color: lastScanInfo.isRunning ? 'var(--primary)' : 'var(--text-dim)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                            marginRight: '0.5rem',
                            opacity: 0.9
                        }}>
                            <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {lastScanInfo.isRunning ? <RefreshCw size={10} className="spin" /> : <Clock size={10} />}
                                {lastScanInfo.isRunning ? (lastScanInfo.status || 'Varredura em curso...') : 'Última varredura'}
                            </span>
                            {lastScanInfo.isRunning ? (
                                <span style={{ opacity: 0.7 }}>Início: {lastScanInfo.lastAttemptDate || 'N/A'}</span>
                            ) : (
                                <span>{lastScanInfo.lastScanDate || 'N/A'}</span>
                            )}
                        </div>
                    )}
                    {user && <div className="user-profile"><User size={18} /><span>{user.name}</span></div>}
                    <button onClick={toggleTheme} className="btn-secondary theme-toggle" title="Alternar Tema">
                        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                    </button>

                    <button onClick={handleLogout} className="btn-danger-outline">Sair</button>
                </div>
            </header>

            <div className="main-tabs">
                <button className={`main-tab-btn ${activeTab === 'ips' ? 'active' : ''}`} onClick={() => handleTabChange('ips')}><Globe size={16} /> Gerenciamento de IPs</button>
                <button className={`main-tab-btn ${activeTab === 'hostnames' ? 'active' : ''}`} onClick={() => handleTabChange('hostnames')}><Tag size={16} /> Nomes de Ativo</button>
                <button className={`main-tab-btn ${activeTab === 'combined' ? 'active' : ''}`} onClick={() => handleTabChange('combined')}><Link size={16} /> Sorteio</button>
                <button className={`main-tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => handleTabChange('history')}><Clock size={16} /> Histórico</button>
            </div>


            {activeTab === 'ips' && (<>
                <section className="dashboard-stats">
                    <div className="stat-card">
                        <div className="stat-icon"><Database size={24} /></div>
                        <div className="stat-info">
                            <span className="stat-label">VLANs</span>
                            <span className="stat-value">{totalVlans}</span>
                        </div>
                    </div>
                    <div className="stat-card info">
                        <div className="stat-icon"><Shield size={24} /></div>
                        <div className="stat-info">
                            <span className="stat-label">Zonas</span>
                            <span className="stat-value">{Object.keys(groupedVlans).length}</span>
                        </div>
                    </div>
                </section>

                <div className="search-bar-modern" style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
                    <Search size={22} />
                    <input
                        type="text"
                        placeholder="Pesquisar IP, range ou zona..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                <section className="ip-selection-tool" style={{ marginBottom: '2.5rem' }}>
                    {selectionError && <div className="selection-error-msg"><Activity size={16} /> {selectionError}</div>}
                    {selectionSuccess && <div className="selection-success-msg"><Zap size={16} /> {selectionSuccess}</div>}
                    <div className="selection-field" style={{ flex: '1 1 200px' }}>
                        <label>Zona de Segurança</label>
                        <select className={blinkingFields.zone ? 'blink-error' : ''} value={selectedZone} onChange={e => { setSelectedZone(e.target.value); setSelectedVlanId(''); }}>
                            <option value="">Selecione uma Zona...</option>
                            {uniqueZones.map(z => <option key={z} value={z}>{z}</option>)}
                        </select>
                    </div>
                    <div className="selection-field" style={{ flex: '2 1 400px' }} onClick={() => { if (!selectedZone) { setSelectionError('Selecione a Zona de Segurança primeiro.'); setBlinkingFields({ zone: true, vlan: false }); setTimeout(() => setBlinkingFields({ zone: false, vlan: false }), 2000); } }}>
                        <label>VLAN (Range & Descrição CMDB)</label>
                        <select className={blinkingFields.vlan ? 'blink-error' : ''} value={selectedVlanId} onChange={e => setSelectedVlanId(e.target.value)} disabled={!selectedZone}>
                            <option value="">Selecione...</option>
                            {zoneVlansList.map(v => <option key={v.id} value={v.id}>Range: {v.range} - Descrição: {v.description || v.name}</option>)}
                        </select>
                    </div>
                    <div className="selection-actions" style={{ marginBottom: '4px' }}>
                        <button className="btn-secondary" onClick={handleGetIps} style={{ height: '48px' }}><List size={18} /> Listar IPs</button>
                        {/* Sortear button hidden in V3 */}
                    </div>
                </section>

                {isGlobalScanning && <div className="global-scanning-loader"><RefreshCw className="spin" size={20} /><span>Analisando...</span></div>}
                {globalScanResult && (
                    <div className="global-search-result-card">
                        <div className="result-header"><h3>Resultado: {globalScanResult.ip}</h3></div>
                        <div className="result-details" onClick={() => navigateToZone(globalScanResult.zone, globalScanResult.ip)} style={{ cursor: 'pointer' }}>
                            <div className="detail-item"><span className="label">Status:</span><span className={`badge-pill ${globalScanResult.status.toLowerCase().replace(' ', '-')}`}>{globalScanResult.status}</span></div>
                            <div className="detail-item"><span className="label">DNS:</span><span className="value">{globalScanResult.dns}</span></div>
                            <div className="detail-item"><span className="label">Zona:</span><span className="value bold">{globalScanResult.zone.name}</span></div>
                            <div className="detail-item"><span className="label">Range:</span><span className="value">{globalScanResult.zone.range}</span></div>
                            <div className="detail-item"><span className="label">Descrição:</span><span className="value">{globalScanResult.zone.description || globalScanResult.zone.name}</span></div>
                            <div className="click-hint">Clique para ir até a VLAN</div>
                        </div>
                    </div>
                )}

                <div className="security-groups">
                    {Object.entries(groupedVlans).map(([zoneName, vlans]) => (
                        <div key={zoneName} className={`security-group-section ${expandedGroups[zoneName] ? 'active' : ''}`}>
                            <div className="group-header" onClick={() => toggleGroup(zoneName)}>
                                <div className="group-info">{expandedGroups[zoneName] ? <ChevronDown size={24} /> : <ChevronRight size={24} />}<div className={`security-tag-large ${zoneName.toLowerCase()}`}>{zoneName}</div></div>
                            </div>
                            {expandedGroups[zoneName] && (
                                <div className="group-content">
                                    {vlans.slice((zonePages[zoneName] - 1) * ITEMS_PER_PAGE, zonePages[zoneName] * ITEMS_PER_PAGE).map(vlan => (
                                        <div key={vlan.id} id={`vlan-card-${vlan.id}`} className="vlan-entry-card">
                                            <div className="vlan-main-info" onClick={() => toggleVlan(vlan)}>
                                                <div className="vlan-summary">
                                                    <div className="vlan-ident"><span className="vlan-key">{vlan.key}</span><h4>{vlan.name}</h4></div>
                                                    <div className="vlan-range-display">
                                                        <Globe size={14} />
                                                        <span>Range: {vlan.range} - Descrição: {vlan.description || vlan.name}</span>
                                                    </div>
                                                </div>
                                                <div className="vlan-status-indicators">{vlan.gateway !== '-' && <span className="gateway-pill">GW: {vlan.gateway}</span>}{expandedVlans[String(vlan.id)] ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</div>
                                            </div>
                                            {expandedVlans[String(vlan.id)] && (
                                                <div className="vlan-detailed-view">
                                                    <div className="vlan-actions-header">
                                                        <div className="range-text">Range: <b>{vlan.initialIp} - {vlan.finalIp}</b></div>
                                                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                                            <div className="limit-control">
                                                                <button
                                                                    className="mini-pagination-btn"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setOpenLimitDropdowns(prev => ({ ...prev, [vlan.id]: !prev[vlan.id] }));
                                                                    }}
                                                                >
                                                                    Mostrar: {customIpLimits[String(vlan.id)] || 5} <ChevronDown size={14} />
                                                                </button>
                                                                {openLimitDropdowns[vlan.id] && (
                                                                    <div className="limit-dropdown">
                                                                        {[5, 10, 25, 50, 100].map(val => (
                                                                            <div
                                                                                key={val}
                                                                                className="limit-option"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setCustomIpLimits(prev => ({ ...prev, [vlan.id]: val }));
                                                                                    setIpPages(prev => ({ ...prev, [vlan.id]: 1 }));
                                                                                    setOpenLimitDropdowns(prev => ({ ...prev, [vlan.id]: false }));
                                                                                }}
                                                                            >
                                                                                {val} por página
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="table-wrapper">
                                                        <table className="ip-table-refined">
                                                            <thead><tr><th>IP</th><th>Hostname</th><th>Status</th><th>Alterações</th><th>Ação</th></tr></thead>
                                                            <tbody>
                                                                {Object.entries(vlanIps[String(vlan.id)] || {}).slice(((ipPages[String(vlan.id)] || 1) - 1) * (customIpLimits[String(vlan.id)] || 5), (ipPages[String(vlan.id)] || 1) * (customIpLimits[String(vlan.id)] || 5)).map(([ip, info]) => (
                                                                    <tr key={ip} className={`ip-row ${info.online ? 'active-row' : ''} ${sortedIps.includes(ip) ? 'highlight-flash' : ''}`}>
                                                                        <td className={`ip-cell ${sortedIps.includes(ip) ? 'ip-cell-highlight' : ''}`}>{ip}</td>
                                                                        <td>{info.dns}</td>
                                                                        <td><span className={`badge-pill ${info.status ? info.status.toLowerCase().replace(' ', '-') : 'desconhecido'}`}>{info.loading ? 'Escaneando...' : (info.status || 'Desconhecido')}</span>{info.manual && <div className="manual-indicator"><Monitor size={10} /> Manual</div>}</td>
                                                                        <td className="audit-cell">{info.manual ? <><div className="audit-user">{info.manual.updatedBy}</div><div className="audit-date">{new Date(info.manual.updatedAt).toLocaleDateString()} {new Date(info.manual.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div></> : '-'}</td>
                                                                        <td className="actions-cell-multi">
                                                                            <button className="mini-action-btn status-btn" title="Status/Histórico" onClick={() => handleOpenStatusModal(ip, info.status)}><Settings size={18} /></button>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>

                                                    <div className="ip-pagination-footer">
                                                        <div className="page-nav-modern">
                                                            <button
                                                                className="modern-nav-btn"
                                                                disabled={(ipPages[String(vlan.id)] || 1) === 1}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setIpPages(prev => ({ ...prev, [vlan.id]: Math.max(1, (prev[vlan.id] || 1) - 1) }));
                                                                }}
                                                            >
                                                                <ChevronLeft size={18} />
                                                            </button>

                                                            <div className="modern-page-info">
                                                                Página <b>{(ipPages[String(vlan.id)] || 1)}</b> de <b>{Math.ceil(Object.keys(vlanIps[String(vlan.id)] || {}).length / (customIpLimits[String(vlan.id)] || 5))}</b>
                                                            </div>

                                                            <button
                                                                className="modern-nav-btn"
                                                                disabled={(ipPages[String(vlan.id)] || 1) >= Math.ceil(Object.keys(vlanIps[String(vlan.id)] || {}).length / (customIpLimits[String(vlan.id)] || 5))}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setIpPages(prev => ({ ...prev, [vlan.id]: (prev[vlan.id] || 1) + 1 }));
                                                                }}
                                                            >
                                                                <ChevronRight size={18} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    <div className="pagination-container">
                                        <button className="pagination-btn" onClick={(e) => { e.stopPropagation(); setZonePages(p => ({ ...p, [zoneName]: Math.max(1, (p[zoneName] || 1) - 1) })) }} disabled={(zonePages[zoneName] || 1) === 1}><ChevronLeft size={16} /> Anterior</button>
                                        <span className="page-indicator">Página {zonePages[zoneName] || 1} de {Math.ceil(vlans.length / ITEMS_PER_PAGE)}</span>
                                        <button className="pagination-btn" onClick={(e) => { e.stopPropagation(); setZonePages(p => ({ ...p, [zoneName]: Math.min(Math.ceil(vlans.length / ITEMS_PER_PAGE), (p[zoneName] || 1) + 1) })) }} disabled={(zonePages[zoneName] || 1) === Math.ceil(vlans.length / ITEMS_PER_PAGE)}><ChevronRight size={16} /> Próxima</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </>)}

            {/* Modal */}
            {statusModal.open && (
                <div className="modal-overlay" onClick={() => { setStatusModal({ open: false, ip: '', currentStatus: '' }); setStatusPassword(''); }}>
                    <div className="modal-card" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
                        <h3>Alterar Status: {statusModal.ip}</h3>
                        <form className="modal-form" onSubmit={handleStatusUpdate}>
                            <div className="form-group">
                                <label>Novo Status</label>
                                <select value={statusTarget} onChange={e => setStatusTarget(e.target.value)}>
                                    <option value="Reservado">Reservado</option>
                                </select>
                            </div>

                            {selectionError && (
                                <div className="selection-error-msg" style={{ marginBottom: '1rem' }}>
                                    <Activity size={14} /> {selectionError}
                                </div>
                            )}

                            <div className="modal-actions">
                                <button type="button" className="btn-ghost" onClick={() => { setStatusModal({ open: false, ip: '', currentStatus: '' }); setStatusPassword(''); }}>Cancelar</button>
                                <button type="submit" className="btn-primary">Confirmar Alteração</button>
                            </div>
                        </form>

                        <div className="history-title"><Clock size={16} /> Histórico de Alterações</div>
                        <div className="history-container" style={{ maxHeight: '200px', overflowY: 'auto', marginTop: '0.5rem' }}>
                            {isHistoryLoading ? (
                                <div className="empty-history"><RefreshCw className="spin" size={14} /> Carregando histórico...</div>
                            ) : ipHistory.length > 0 ? (
                                <table className="history-table">
                                    <thead>
                                        <tr>
                                            <th>Data/Hora</th>
                                            <th>Status</th>
                                            <th>Usuário</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ipHistory.map((h, i) => (
                                            <tr key={i}>
                                                <td>{new Date(h.updatedAt).toLocaleDateString()} {new Date(h.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                                <td><span className={`badge-pill mini ${h.status.toLowerCase().replace(' ', '-')}`}>{h.status}</span></td>
                                                <td>{h.updatedBy}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="empty-history">Sem histórico registrado para este IP</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Hostnames Section */}
            {activeTab === 'hostnames' && (
                <div className="hostnames-panel">
                    {hostnameTabSuccess && <div className="selection-success-msg" style={{ marginBottom: '1rem' }}><Zap size={16} /> {hostnameTabSuccess}</div>}
                    {hostnameTabError && <div className="selection-error-msg" style={{ marginBottom: '1rem' }}><Activity size={16} /> {hostnameTabError}</div>}
                    <div className="hostname-controls">
                        <section className="ip-selection-tool" style={{ marginBottom: '2.5rem' }}>
                            <div className="selection-field" style={{ flex: '2 1 400px' }}>
                                <label>Pesquisa</label>
                                <div className="input-with-icon">
                                    <Search size={20} className="field-icon" />
                                    <input
                                        type="text"
                                        placeholder="Nome, chave ou descrição..."
                                        value={hostnameSearch}
                                        onChange={e => {
                                            setHostnameSearch(e.target.value);
                                            setHostnamePage(1);
                                            setHostnameSortedKeys([]); // Clear sorting
                                            if (e.target.value) {
                                                // Clear filters so the searched item is visible
                                                setHostnameSituacao('todos');
                                                setHostnamePais('todos');
                                                setHostnamePadrao('todos');
                                                setHostnameLetra('todos');
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                            <div className="selection-actions" style={{ marginBottom: '4px' }}>
                                {/* Sortear Nomes button hidden in V3 */}

                            </div>
                        </section>

                        <div className="alphabet-filter">
                            {alphabet.map(char => (
                                <button
                                    key={char}
                                    className={`letter-btn ${hostnameLetra === char ? 'active' : ''}`}
                                    onClick={() => { setHostnameLetra(char); setHostnamePage(1); }}
                                >
                                    {char.toUpperCase()}
                                </button>
                            ))}
                        </div>

                        <div className="hostname-filters">
                            <div className="filter-group">
                                <label><Filter size={14} /> Situação:</label>
                                <select className="filter-select" value={hostnameSituacao} onChange={e => { setHostnameSituacao(e.target.value); setHostnamePage(1); }}>
                                    <option value="todos">Todos</option>
                                    <option value="Em Uso">Em Uso</option>
                                    <option value="Disponível">Disponível</option>
                                    <option value="Reservado">Reservado</option>
                                </select>
                            </div>

                            <div className="filter-group">
                                <label><Monitor size={14} /> Padronização:</label>
                                <select className="filter-select" value={hostnamePadrao} onChange={e => { setHostnamePadrao(e.target.value); setHostnamePage(1); }}>
                                    <option value="todos">Todos</option>
                                    <option value="Padronizado">Padronizado</option>
                                    <option value="Fora de Padrão">Fora de Padrão</option>
                                </select>
                            </div>

                            <div className="filter-group">
                                <label><Globe size={14} /> País:</label>
                                <select className="filter-select" value={hostnamePais} onChange={e => { setHostnamePais(e.target.value); setHostnamePage(1); }}>
                                    <option value="todos">Todos</option>
                                    {uniquePais.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>

                            <div className="result-count">
                                Exibindo {paginatedHostnames.length} de {filteredHostnames.length} ativos
                            </div>
                        </div>
                    </div>

                    {hostnameError && hostnamesFetched.current && <div className="error-banner">{hostnameError}</div>}

                    {hostnameLoading && hostnames.length === 0 ? (
                        <div className="loading-state">
                            <RefreshCw className="spin" size={40} />
                            <p>Carregando Nomes de Ativo...</p>
                        </div>
                    ) : (
                        <div className="hostname-table-wrapper">
                            <table className="hostname-table">
                                <thead>
                                    <tr>
                                        <th>Chave</th>
                                        <th>Nome do Ativo</th>
                                        <th>Situação</th>
                                        <th>Padronização</th>
                                        <th>País</th>
                                        <th>Descrição</th>
                                        <th style={{ textAlign: 'right' }}>Ação</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedHostnames.length > 0 ? paginatedHostnames.map(h => {
                                        const manual = hostnameManualStatuses[h.key];
                                        const displayStatus = (manual ? manual.status : h.situacao) || 'Desconhecido';

                                        // Normaliza classes para cores consistentes
                                        const s = displayStatus.toLowerCase();
                                        const isAvailable = s.includes('disponível') || s.includes('free') || s.includes('available') || s.includes('livre');
                                        const isInUse = s.includes('uso') || s.includes('busy') || s.includes('taken');
                                        const isReserved = s.includes('reservado') || s.includes('reserved');

                                        const statusClass = isInUse ? 'em-uso' : (isAvailable ? 'disponivel' : (isReserved ? 'reservado' : 'unknown'));
                                        const rowClass = isInUse ? 'in-use' : (isAvailable ? 'available' : '');

                                        return (
                                            <tr key={h.id} className={`hostname-row ${rowClass} ${hostnameSortedKeys.includes(h.key) ? 'highlight-flash' : ''}`}>
                                                <td className={`key-cell ${hostnameSortedKeys.includes(h.key) ? 'ip-cell-highlight' : ''}`}>{h.key}</td>
                                                <td className="name-cell"><strong>{h.name}</strong></td>
                                                <td>
                                                    <span className={`situacao-badge ${statusClass}`}>
                                                        {displayStatus}
                                                    </span>
                                                    {manual && <div className="manual-indicator" style={{ marginTop: '4px' }}><Monitor size={10} /> Manual por {manual.updatedBy}</div>}
                                                </td>
                                                <td>
                                                    <span className={`padrao-badge ${h.padronizacao === 'Padronizado' ? 'padrao' : 'fora'}`}>
                                                        {h.padronizacao}
                                                    </span>
                                                </td>
                                                <td>{h.pais}</td>
                                                <td className="desc-cell" title={h.descricao}>{h.descricao}</td>
                                                <td className="actions-cell-multi">
                                                    <button className="mini-action-btn status-btn" title="Alterar Status" onClick={() => handleOpenHostnameStatusModal(h)}><Settings size={18} /></button>
                                                </td>
                                            </tr>
                                        );
                                    }) : (
                                        <tr>
                                            <td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
                                                Nenhum ativo encontrado com os filtros atuais.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {totalHostnamePages > 1 && (
                        <div className="pagination-container" style={{ marginTop: '20px' }}>
                            <button
                                className="pagination-btn"
                                onClick={() => setHostnamePage(p => Math.max(1, p - 1))}
                                disabled={hostnamePage === 1}
                            >
                                <ChevronLeft size={16} /> Anterior
                            </button>
                            <span className="page-indicator">Página {hostnamePage} de {totalHostnamePages}</span>
                            <button
                                className="pagination-btn"
                                onClick={() => setHostnamePage(p => Math.min(totalHostnamePages, p + 1))}
                                disabled={hostnamePage === totalHostnamePages}
                            >
                                Próxima <ChevronRight size={16} />
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* === COMBINED SORTER TAB === */}
            {activeTab === 'combined' && (
                <div className="hostnames-panel">
                    <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem', boxShadow: 'var(--shadow-sm, 0 2px 8px rgba(0,0,0,0.12))' }}>
                        <h2 style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', marginTop: 0 }}>
                            <Link size={20} /> Sorteio
                        </h2>
                        <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginTop: 0, marginBottom: '1.5rem' }}>
                            Sortear um IP livre e um Nome de Ativo disponível ao mesmo tempo, e marcá-los como Em Uso em um único clique.
                        </p>

                        {combinedError && <div className="selection-error-msg" style={{ marginBottom: '1rem' }}><Activity size={16} /> {combinedError}</div>}
                        {combinedSuccess && <div className="selection-success-msg" style={{ marginBottom: '1rem' }}><Zap size={16} /> {combinedSuccess}</div>}

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
                            <div className="selection-field" style={{ flex: '1 1 200px' }}>
                                <label>Zona de Segurança</label>
                                <select value={combinedZone} onChange={e => { setCombinedZone(e.target.value); setCombinedVlanId(''); setCombinedResult(null); }}>
                                    <option value="">Selecione uma Zona...</option>
                                    {uniqueZones.map(z => <option key={z} value={z}>{z}</option>)}
                                </select>
                            </div>
                            <div className="selection-field" style={{ flex: '2 1 350px' }}>
                                <label>VLAN (Range &amp; Descrição)</label>
                                <select value={combinedVlanId} onChange={e => { setCombinedVlanId(e.target.value); setCombinedResult(null); }} disabled={!combinedZone}>
                                    <option value="">Selecione...</option>
                                    {data.vlans.filter(v => (v.securityZone || 'Outras') === combinedZone).map(v => (
                                        <option key={v.id} value={v.id}>{v.range} — {v.description || v.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ paddingBottom: '2px' }}>
                                <button className="btn-primary" onClick={handleCombinedDraw} disabled={combinedLoading} style={{ height: '48px', minWidth: '160px' }}>
                                    {combinedLoading ? <RefreshCw size={18} className="spin" /> : <Zap size={18} />}
                                    {combinedLoading ? ' Sorteando...' : ' Sortear Par'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Always-rendered result area to prevent layout shift */}
                    <div style={{ minHeight: '280px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {combinedResult ? (
                            <>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                    {/* IP Card */}
                                    <div className="global-search-result-card" style={{ margin: 0 }}>
                                        <div className="result-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Globe size={18} />
                                            <h3 style={{ margin: 0 }}>IP Sorteado</h3>
                                        </div>
                                        <div className="result-details" style={{ cursor: 'default' }}>
                                            <div className="detail-item">
                                                <span className="label">Endereço:</span>
                                                <span className="value bold" style={{ fontSize: '1.2rem', fontFamily: 'monospace' }}>{combinedResult.ip}</span>
                                            </div>
                                            <div className="detail-item">
                                                <span className="label">VLAN:</span>
                                                <span className="value">{combinedResult.vlan.range}</span>
                                            </div>
                                            <div className="detail-item">
                                                <span className="label">Zona:</span>
                                                <span className="value">{combinedResult.vlan.securityZone}</span>
                                            </div>
                                            <div className="detail-item">
                                                <span className="label">Status Atual:</span>
                                                <span className="badge-pill disponível">Disponível</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Hostname Card */}
                                    <div className="global-search-result-card" style={{ margin: 0 }}>
                                        <div className="result-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Tag size={18} />
                                            <h3 style={{ margin: 0 }}>Nome de Ativo Sorteado</h3>
                                        </div>
                                        <div className="result-details" style={{ cursor: 'default' }}>
                                            <div className="detail-item">
                                                <span className="label">Chave:</span>
                                                <span className="value bold" style={{ fontFamily: 'monospace' }}>{combinedResult.hostname.key}</span>
                                            </div>
                                            <div className="detail-item">
                                                <span className="label">Nome:</span>
                                                <span className="value bold" style={{ fontSize: '1.1rem' }}>{combinedResult.hostname.name}</span>
                                            </div>
                                            <div className="detail-item">
                                                <span className="label">País:</span>
                                                <span className="value">{combinedResult.hostname.pais || '-'}</span>
                                            </div>
                                            <div className="detail-item">
                                                <span className="label">Status Atual:</span>
                                                <span className="situacao-badge disponivel">Disponível</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                    <button
                                        onClick={() => { setCombinedResult(null); setCombinedError(null); }}
                                        style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', borderRadius: '8px', padding: '0.6rem 1.2rem', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem' }}
                                    >
                                        Descartar
                                    </button>
                                    <button className="btn-primary" onClick={handleCombinedDraw} style={{ minWidth: '140px' }}>
                                        <RefreshCw size={16} /> Novo Sorteio
                                    </button>
                                    <button
                                        onClick={() => { setCombinedAction('Reservado'); setCombinedConfirmModal(true); setCombinedError(null); setCombinedPassword(''); setSelectionError(null); }}
                                        style={{ minWidth: '190px', background: '#7c3aed', border: 'none', color: '#fff', borderRadius: '8px', padding: '0.6rem 1.2rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.95rem' }}
                                    >
                                        <Lock size={18} /> Reservar Ambos
                                    </button>
                                    {/* Marcar Ambos Em Uso button hidden in V3 */}
                                </div>
                            </>
                        ) : (
                            <div className="loading-state" style={{ opacity: 0.5 }}>
                                <Link size={40} />
                                <p>{combinedLoading ? 'Sorteando...' : 'Selecione uma VLAN e clique em "Sortear Par" para começar.'}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Combined Confirm Modal */}
            {combinedConfirmModal && combinedResult && (
                <div className="modal-overlay" onClick={() => { setCombinedConfirmModal(false); setCombinedPassword(''); }}>
                    <div className="modal-card" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: combinedAction === 'Reservado' ? (theme === 'dark' ? '#38bdf8' : '#7c3aed') : undefined }}>
                            {combinedAction === 'Reservado' ? <Lock size={20} /> : <CheckCircle size={20} />}
                            {combinedAction === 'Reservado' ? 'Confirmar Reserva' : 'Confirmar Atribuição'}
                        </h3>
                        <p style={{ color: 'var(--text-dim)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                            Você está prestes a marcar como <strong>{combinedAction}</strong>:<br />
                            🖥️ IP: <strong style={{ fontFamily: 'monospace' }}>{combinedResult.ip}</strong> ({combinedResult.vlan?.securityZone || 'Outras'})<br />
                            🏷️ Nome: <strong>{combinedResult.hostname.name}</strong> ({combinedResult.hostname.key})
                        </p>
                        {combinedError && <div className="selection-error-msg" style={{ marginBottom: '1rem' }}><Activity size={14} /> {combinedError}</div>}
                        <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                            <button type="button" className="btn-ghost" onClick={() => { setCombinedConfirmModal(false); setCombinedPassword(''); }}>Cancelar</button>
                            <button
                                onClick={handleCombinedConfirm}
                                disabled={combinedConfirmLoading}
                                style={{ minWidth: '140px', background: combinedAction === 'Reservado' ? '#7c3aed' : '#10b981', border: 'none', color: '#fff', borderRadius: '8px', padding: '0.6rem 1.2rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: combinedConfirmLoading ? 0.6 : 1 }}
                            >
                                {combinedConfirmLoading
                                    ? <><RefreshCw size={16} className="spin" /> Confirmando...</>
                                    : combinedAction === 'Reservado'
                                        ? <><Lock size={16} /> Reservar</>
                                        : <><CheckCircle size={16} /> Confirmar</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Hostname Status Modal */}
            {hostnameStatusModal.open && (
                <div className="modal-overlay" onClick={() => { setHostnameStatusModal({ open: false, key: '', currentStatus: '', name: '' }); setStatusPassword(''); }}>
                    <div className="modal-card" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
                        <h3>Alterar Status do Ativo: {hostnameStatusModal.key}</h3>
                        <p style={{ color: 'var(--text-main)', fontWeight: '600', marginBottom: '1.5rem', fontSize: '1.1rem' }}>{hostnameStatusModal.name}</p>

                        <form className="modal-form" onSubmit={handleHostnameStatusUpdate}>
                            <div className="form-group">
                                <label>Novo Status</label>
                                <select value={hostnameStatusTarget} onChange={e => setHostnameStatusTarget(e.target.value)}>
                                    <option value="Reservado">Reservado</option>
                                </select>
                            </div>
                            {hostnameModalError && (
                                <div className="selection-error-msg" style={{ marginBottom: '1rem' }}>
                                    <Activity size={14} /> {hostnameModalError}
                                </div>
                            )}
                            <div className="modal-actions">
                                <button type="button" className="btn-ghost" onClick={() => { setHostnameStatusModal({ open: false, key: '', currentStatus: '', name: '' }); setStatusPassword(''); }}>Cancelar</button>
                                <button type="submit" className="btn-primary">Confirmar Alteração</button>
                            </div>
                        </form>

                        <div className="history-section">
                            <h4 className="history-title"><Clock size={16} /> Histórico de Alterações</h4>
                            {isHostnameHistoryLoading ? (
                                <div className="history-loading"><RefreshCw className="spin" size={20} /></div>
                            ) : hostnameHistory.length > 0 ? (
                                <>
                                    <table className="history-table">
                                        <thead>
                                            <tr>
                                                <th>Data/Hora</th>
                                                <th>Status</th>
                                                <th>Usuário</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {hostnameHistory
                                                .slice((historyPage - 1) * HISTORY_PER_PAGE, historyPage * HISTORY_PER_PAGE)
                                                .map((h, i) => (
                                                    <tr key={i}>
                                                        <td>{new Date(h.updatedAt).toLocaleDateString()} {new Date(h.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                                        <td><span className={`situacao-badge mini ${h.status.toLowerCase().includes('uso') ? 'em-uso' : (h.status.toLowerCase().includes('reservado') ? 'reservado' : 'disponivel')}`}>{h.status}</span></td>
                                                        <td>{h.updatedBy}</td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>

                                    {hostnameHistory.length > HISTORY_PER_PAGE && (
                                        <div className="pagination-container small" style={{ marginTop: '10px', justifyContent: 'center', gap: '1rem' }}>
                                            <button
                                                type="button"
                                                onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                                                disabled={historyPage === 1}
                                                className="mini-pagination-btn"
                                            >
                                                <ChevronLeft size={14} /> Anterior
                                            </button>
                                            <span style={{ fontSize: '0.85rem' }}>Página {historyPage} de {Math.ceil(hostnameHistory.length / HISTORY_PER_PAGE)}</span>
                                            <button
                                                type="button"
                                                onClick={() => setHistoryPage(p => Math.min(Math.ceil(hostnameHistory.length / HISTORY_PER_PAGE), p + 1))}
                                                disabled={historyPage >= Math.ceil(hostnameHistory.length / HISTORY_PER_PAGE)}
                                                className="mini-pagination-btn"
                                            >
                                                Próxima <ChevronRight size={14} />
                                            </button>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="empty-history">Sem histórico registrado para este ativo</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* === GLOBAL HISTORY TAB === */}
            {activeTab === 'history' && (
                <div className="hostnames-panel">
                    <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem', boxShadow: 'var(--shadow-sm)' }}>
                        <h2 style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', marginTop: 0 }}>
                            <Clock size={20} /> Histórico Global de Alterações
                        </h2>

                        <div className="hostname-filters" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                            <div className="filter-group">
                                <label><Clock size={14} /> Período:</label>
                                <select className="filter-select" value={historyTimeRange} onChange={e => { setHistoryTimeRange(e.target.value); setGlobalHistoryPage(1); }}>
                                    <option value="today">Hoje</option>
                                    <option value="week">Última Semana</option>
                                    <option value="month">Último Mês</option>
                                    <option value="3months">Últimos 3 Meses</option>
                                </select>
                            </div>

                            <div className="filter-group">
                                <label><Filter size={14} /> Tipo:</label>
                                <select className="filter-select" value={historyTypeFilter} onChange={e => { setHistoryTypeFilter(e.target.value); setGlobalHistoryPage(1); }}>
                                    <option value="todos">Todos (IP / Nomes)</option>
                                    <option value="IP">Somente IPs</option>
                                    <option value="HOSTNAME">Somente Nomes de Ativo</option>
                                </select>
                            </div>

                            <div className="filter-group">
                                <label><Activity size={14} /> Status:</label>
                                <select className="filter-select" value={historyStatusFilter} onChange={e => { setHistoryStatusFilter(e.target.value); setGlobalHistoryPage(1); }}>
                                    <option value="todos">Todos os Estados</option>
                                    <option value="Em Uso">Em Uso</option>
                                    <option value="Disponível">Disponível</option>
                                    <option value="Reservado">Reservado</option>
                                </select>
                            </div>

                            <div className="filter-group">
                                <label><Settings size={14} /> Por página:</label>
                                <select
                                    className="filter-select"
                                    value={globalHistoryPerPage}
                                    onChange={e => { setGlobalHistoryPerPage(Number(e.target.value)); setGlobalHistoryPage(1); }}
                                >
                                    <option value={10}>10</option>
                                    <option value={15}>15</option>
                                    <option value={30}>30</option>
                                    <option value={50}>50</option>
                                </select>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                <button className="btn-secondary" onClick={fetchGlobalHistory} disabled={globalHistoryLoading} style={{ height: '42px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                    <RefreshCw size={16} className={globalHistoryLoading ? 'spin' : ''} /> {globalHistoryLoading ? 'Atualizando...' : 'Atualizar'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="hostname-table-wrapper">
                        <table className="hostname-table">
                            <thead>
                                <tr>
                                    <th>Data / Hora</th>
                                    <th>Tipo</th>
                                    <th>Identificador</th>
                                    <th>De</th>
                                    <th>Para</th>
                                    <th>Alterado Por</th>
                                </tr>
                            </thead>
                            <tbody>
                                {globalHistoryLoading ? (
                                    <tr><td colSpan="6" style={{ textAlign: 'center', padding: '3rem' }}><RefreshCw className="spin" size={32} /> <p style={{ marginTop: '1rem' }}>Carregando Histórico...</p></td></tr>
                                ) : paginatedGlobalHistory.length > 0 ? paginatedGlobalHistory.map(item => (
                                    <tr key={item.id} className="hostname-row">
                                        <td style={{ whiteSpace: 'nowrap' }}>{new Date(item.updatedAt).toLocaleString('pt-BR')}</td>
                                        <td>
                                            <span className={`padrao-badge ${item.type === 'IP' ? 'padrao' : 'fora'}`} style={{ fontSize: '0.7rem' }}>
                                                {item.type}
                                            </span>
                                        </td>
                                        <td className="key-cell bold">
                                            {item.type === 'HOSTNAME' && item.details && item.details !== item.identifier ? (
                                                <>
                                                    <strong>{item.details}</strong>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 'normal', marginTop: '2px' }}>{item.identifier}</div>
                                                </>
                                            ) : (
                                                item.identifier
                                            )}
                                        </td>
                                        <td style={{ color: 'var(--text-dim)' }}>{item.oldStatus || '-'}</td>
                                        <td>
                                            <span className={`situacao-badge ${(item.newStatus || '').toLowerCase().includes('uso') ? 'em-uso' : (item.newStatus || '').toLowerCase().includes('reservado') ? 'reservado' : 'disponivel'}`}>
                                                {item.newStatus}
                                            </span>
                                        </td>
                                        <td><strong>{item.updatedBy}</strong></td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>Nenhum histórico encontrado para os filtros selecionados.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {totalGlobalHistoryPages > 1 && (
                        <div className="pagination-container" style={{ marginTop: '20px', marginBottom: '40px' }}>
                            <button
                                className="pagination-btn"
                                onClick={() => setGlobalHistoryPage(p => Math.max(1, p - 1))}
                                disabled={globalHistoryPage === 1}
                            >
                                <ChevronLeft size={16} /> Anterior
                            </button>
                            <span className="page-indicator">Página {globalHistoryPage} de {totalGlobalHistoryPages}</span>
                            <button
                                className="pagination-btn"
                                onClick={() => setGlobalHistoryPage(p => Math.min(totalGlobalHistoryPages, p + 1))}
                                disabled={globalHistoryPage === totalGlobalHistoryPages}
                            >
                                Próxima <ChevronRight size={16} />
                            </button>
                        </div>
                    )}
                </div>
            )}

            <footer style={{
                textAlign: 'center',
                padding: '1.5rem 0',
                color: 'var(--text-secondary)',
                fontSize: '0.75rem',
                opacity: 0.6,
                borderTop: '1px solid var(--border)',
                marginTop: '3rem',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem'
            }}>
                <div>© {new Date().getFullYear()} {config.companyName} - Gerenciamento de Infraestrutura | Versão 4.2.1</div>
                {lastScanInfo && lastScanInfo.lastScanDate && (
                    <div style={{ color: 'var(--success)', opacity: 0.8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        <Activity size={12} /> Última varredura global: {lastScanInfo.lastScanDate}
                    </div>
                )}
            </footer>
        </div>
    );
}
