// Иконки интерфейса: inline SVG 24×24, цвет берётся из currentColor.
// Контурные — для кнопок и показателей, залитые силуэты — для оружия.
const S = (body, fill = false) => `<svg viewBox="0 0 24 24" aria-hidden="true" ${fill ? 'fill="currentColor" stroke="none"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}>${body}</svg>`;

export const ICON = {
  heart: S('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>'),
  bolt: S('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
  food: S('<rect x="6" y="5" width="12" height="15" rx="2"/><path d="M6 9h12M6 16h12"/>'),
  water: S('<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>'),
  blood: S('<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>', true),
  bio: S('<circle cx="12" cy="12" r="2.5"/><path d="M12 9.5V4M9.8 13.3 5 16M14.2 13.3 19 16"/><circle cx="12" cy="12" r="8"/>'),
  shield: S('<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/>'),
  aim: S('<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'),
  fire: S('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/>'),
  reload: S('<path d="M20 11a8 8 0 0 0-14.5-4.5M4 13a8 8 0 0 0 14.5 4.5"/><path d="M5 3v4h4M19 21v-4h-4"/>'),
  jump: S('<path d="M12 20V5M6 11l6-6 6 6"/>'),
  crouch: S('<path d="M6 7l6 6 6-6M6 13l6 6 6-6"/>'),
  swap: S('<path d="M4 8h14l-3-3M20 16H6l3 3"/>'),
  hand: S('<path d="M8 13V6a1.5 1.5 0 0 1 3 0v6M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-2-4a1.5 1.5 0 0 1 2.6-1.5L8 14"/>'),
  light: S('<path d="M9 2h6v5l-2 3v10h-2V10L9 7z"/><path d="M5 4l2 1M19 4l-2 1"/>'),
  med: S('<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M9 6V4h6v2M12 10v6M9 13h6"/>'),
  bag: S('<path d="M6 8h12l1 12H5z"/><path d="M9 8a3 3 0 0 1 6 0"/>'),
  map: S('<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>'),
  pause: S('<path d="M8 5v14M16 5v14"/>'),
  exit: S('<path d="M14 4h5v16h-5M10 12h9M7 8l-4 4 4 4"/>'),
  horn: S('<path d="M4 10v4h4l7 4V6L8 10z"/><path d="M18 9a4 4 0 0 1 0 6"/>'),
  brake: S('<circle cx="12" cy="12" r="8"/><path d="M8 12h8"/>'),
  sprint: S('<path d="M13 4a2 2 0 1 1 0 .1M9 21l3-6 3 2v4M7 12l3-4 4 1 2 3 3 1"/>'),
};

// силуэты оружия (вид сбоку, дуло вправо), 48×24
const W = body => `<svg viewBox="0 0 48 24" aria-hidden="true" fill="currentColor">${body}</svg>`;
export const WICON = {
  fists: W('<path d="M18 8h10a3 3 0 0 1 3 3v4a4 4 0 0 1-4 4h-7a3 3 0 0 1-3-3z"/><path d="M19 8V6h3v2M23 8V5h3v3M27 8V6h3v3" />'),
  knife: W('<rect x="4" y="11" width="12" height="4" rx="1.5"/><path d="M16 10h22l6 2-6 3H16z"/>'),
  machete: W('<rect x="3" y="11" width="10" height="4" rx="1.5"/><path d="M13 9h24l8 3-3 4H13z"/>'),
  crowbar: W('<rect x="4" y="11" width="34" height="3" rx="1.5"/><path d="M38 11l5-4 2 2-4 4v1h-3z"/><path d="M4 11l-2 2 2 2"/>'),
  bat: W('<rect x="3" y="11" width="10" height="3" rx="1.5"/><path d="M13 10.5 44 8a3 3 0 0 1 0 8l-31-2.5z"/>'),
  axe: W('<rect x="3" y="11" width="34" height="3" rx="1.5"/><path d="M33 4h6l4 3v11l-4 3h-6z"/>'),
  chainsaw: W('<path d="M3 8h6l2-3h10l2 3h2v10H11l-2 2H3z"/><path d="M25 10h17a3 3 0 0 1 0 6H25z"/><path d="M27 9l2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2M27 17l2 2 2-2 2 2 2-2 2 2 2-2 2 2 2-2" fill="none" stroke="currentColor" stroke-width="1"/>'),
  pistol: W('<path d="M12 7h26v6H22l-2 2v6h-7l1-8h-2z"/>'),
  revolver: W('<path d="M8 8h6l2-2h6v3h20v4H22l-2 2v6h-7l1-6-6-1z"/><circle cx="18" cy="11" r="3.5"/>'),
  smg: W('<path d="M4 9h8l2-2h22v5h8v2h-8v1H24v8h-5v-8h-3l-2 3H8l-2-3H4z"/>'),
  rifle: W('<path d="M2 10l8-1 2-2h24v3h10v2H36v2H24l-2 7h-5l1-7h-4l-3 3H4z"/>'),
  sniper: W('<path d="M2 11l8-1 2-2h26v2h9v2h-9v2H24l-2 6h-5l1-6h-4l-3 3H4z"/><rect x="18" y="3" width="12" height="3" rx="1.5"/>'),
  shotgun: W('<path d="M2 12l8-2 3-1h31v3H26v2h10v2H24l-2 0-3 4h-5l2-5H8z"/>'),
  grenade: W('<ellipse cx="24" cy="14" rx="7" ry="8"/><rect x="21" y="3" width="6" height="4" rx="1"/><path d="M27 5h6v2h-6z"/>'),
  molotov: W('<path d="M20 9h8v3l3 3v7H17v-7l3-3z"/><path d="M22 3h4v6h-4z"/><path d="M24 0c3 2 2 3 0 3 0-1-2-1 0-3z"/>'),
};
