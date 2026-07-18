// Sprite SVG global da sidebar/nav — símbolos <symbol id="ic-*"> usados via
// navIcon(id) em js/navigation.js. Extraído para dado puro (Fase 2 sub-fase 2).
export const ICON_SPRITE_MARKUP = `
    <symbol id="ic-dashboard"    viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/></symbol>
    <symbol id="ic-wallet"       viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="16" cy="14.5" r="1.2" fill="currentColor" stroke="none"/></symbol>
    <symbol id="ic-trend"        viewBox="0 0 24 24"><polyline points="3,17 9,11 13,15 21,6"/><polyline points="15,6 21,6 21,12"/></symbol>
    <symbol id="ic-calendar"     viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></symbol>
    <symbol id="ic-chat"         viewBox="0 0 24 24"><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/></symbol>
    <symbol id="ic-settings"     viewBox="0 0 24 24"><line x1="4" y1="6" x2="20" y2="6"/><circle cx="9" cy="6" r="2" fill="currentColor" stroke="none"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="7" cy="18" r="2" fill="currentColor" stroke="none"/></symbol>
    <symbol id="ic-moon"         viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></symbol>
    <symbol id="ic-sun"          viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.78" y2="4.22"/></symbol>
    <symbol id="ic-eye"          viewBox="0 0 24 24"><path d="M1 12S5 5 12 5s11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></symbol>
    <symbol id="ic-eye-off"      viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></symbol>
    <symbol id="ic-chevron-left" viewBox="0 0 24 24"><polyline points="15,4 9,12 15,20"/></symbol>
    <symbol id="ic-chevron-down" viewBox="0 0 24 24"><polyline points="6,9 12,15 18,9"/></symbol>
    <symbol id="ic-menu"          viewBox="0 0 24 24"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></symbol>
    <symbol id="ic-arrows-updown" viewBox="0 0 24 24"><path d="M7 3v14M7 17l-3-3M7 17l3-3"/><path d="M17 21V7M17 7l3 3M17 7l-3 3"/></symbol>
    <symbol id="ic-receipt"       viewBox="0 0 24 24"><path d="M5 3h14v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5V3z"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/></symbol>
    <symbol id="ic-card"          viewBox="0 0 24 24"><rect x="2.5" y="6" width="19" height="13" rx="2.5"/><path d="M2.5 10.5h19"/><rect x="5.5" y="13.7" width="4" height="2" rx=".5" fill="currentColor" stroke="none"/></symbol>
    <symbol id="ic-file-text"     viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/></symbol>
    <symbol id="ic-target"        viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></symbol>
    <symbol id="ic-briefcase"     viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="3" y1="12" x2="21" y2="12"/></symbol>
    <symbol id="ic-coin"          viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9 15.5c.5 1 1.7 1.5 3 1.5 2 0 3.2-1 3.2-2.3 0-3-6-1.4-6-4.2 0-1.3 1.2-2.3 3-2.3 1.3 0 2.4.5 3 1.4"/><line x1="12" y1="6" x2="12" y2="8"/><line x1="12" y1="16" x2="12" y2="18"/></symbol>
    <symbol id="ic-diamond"       viewBox="0 0 24 24"><path d="M2 9h20M9 3l-3 6 6 12 6-12-3-6z"/></symbol>
    <symbol id="ic-flag"          viewBox="0 0 24 24"><path d="M5 3v18"/><path d="M5 4h13l-3 4 3 4H5"/></symbol>
    <symbol id="ic-flame"         viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 17a2.5 2.5 0 0 0 2.5-2.5c0-1.38-.5-2-1-3 1.5.5 3 2.5 3 5a4.5 4.5 0 0 1-9 0c0-2 1-3.5 2-5 0 1.5 1 2.5 1 2.5z"/></symbol>
    <symbol id="ic-scale"         viewBox="0 0 24 24"><path d="M12 3v18"/><path d="M5 7h14"/><path d="M5 7l-3 7a4 4 0 0 0 6 0z"/><path d="M19 7l-3 7a4 4 0 0 0 6 0z"/></symbol>
    <symbol id="ic-droplet"       viewBox="0 0 24 24"><path d="M12 2s7 7.5 7 12a7 7 0 0 1-14 0c0-4.5 7-12 7-12z"/></symbol>
    <symbol id="ic-bar-chart"     viewBox="0 0 24 24"><line x1="3" y1="20" x2="21" y2="20"/><line x1="6" y1="20" x2="6" y2="13"/><line x1="12" y1="20" x2="12" y2="8"/><line x1="18" y1="20" x2="18" y2="4"/></symbol>
    <symbol id="ic-activity"      viewBox="0 0 24 24"><polyline points="3,12 8,12 10,18 14,6 16,12 21,12"/></symbol>
    <symbol id="ic-search"        viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><line x1="15.5" y1="15.5" x2="21" y2="21"/></symbol>
    <symbol id="ic-folder"        viewBox="0 0 24 24"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></symbol>
    <symbol id="ic-user"          viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/></symbol>
    <symbol id="ic-import"        viewBox="0 0 24 24"><path d="M12 3v11"/><polyline points="8,10 12,14 16,10"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></symbol>
    <symbol id="ic-bell"          viewBox="0 0 24 24"><path d="M12 3a5 5 0 0 0-5 5v3c0 1-.5 2-1.5 3h13c-1-1-1.5-2-1.5-3V8a5 5 0 0 0-5-5z"/><path d="M9.5 19a2.5 2.5 0 0 0 5 0"/></symbol>
    <symbol id="ic-archive"       viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><line x1="10" y1="13" x2="14" y2="13"/></symbol>
    <symbol id="ic-rotate-ccw"    viewBox="0 0 24 24"><path d="M4 4v6h6"/><path d="M4.5 13a8 8 0 1 0 2.5-6.5L4 10"/></symbol>
    <symbol id="ic-plane"         viewBox="0 0 24 24"><path d="M2 16l20-8-8 20-2-8-8-2z"/><path d="M22 8L10 14"/></symbol>
  `;
