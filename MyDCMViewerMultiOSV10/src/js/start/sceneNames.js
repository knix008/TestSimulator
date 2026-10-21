// Names and small line icons for the start-page background scenes
// (src/js/start/start3d/scenes.js), in Korean and English.

export const SCENE_NAMES = {
  ctgantry: { ko: 'CT 스캐너', en: 'CT Scanner' },
  mrislices: { ko: 'MRI 단면', en: 'MRI Slices' },
  xray: { ko: '엑스레이', en: 'X-Ray' },
  dna: { ko: 'DNA 나선', en: 'DNA Helix' },
  cells: { ko: '세포', en: 'Cells' },
  neurons: { ko: '신경망', en: 'Neurons' },
  heartbeat: { ko: '심전도', en: 'Heartbeat' },
  vessels: { ko: '혈관 조영', en: 'Angiography' },
  molecules: { ko: '조영제 분자', en: 'Molecules' },
  ultrasound: { ko: '초음파', en: 'Ultrasound' },
  pacs: { ko: 'PACS 서버', en: 'PACS Servers' },
  voxels: { ko: '복셀 볼륨', en: 'Voxel Volume' },
  hospital: { ko: '병원', en: 'Hospital' },
  lungs: { ko: '폐', en: 'Lungs' },
  spine: { ko: '척추', en: 'Spine' },
  endoscope: { ko: '내시경', en: 'Endoscope' },
  petscan: { ko: 'PET 스캐너', en: 'PET scanner' },
  linac: { ko: '방사선 치료기', en: 'Radiotherapy linac' },
};

const icon = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const SCENE_ICONS = {
  ctgantry: icon('<circle cx="12" cy="10" r="7"/><circle cx="12" cy="10" r="3"/><path d="M3 21h18M7 17.5h10"/>'),
  mrislices: icon('<path d="M3 8l9-4 9 4-9 4z"/><path d="M3 12l9 4 9-4"/><path d="M3 16l9 4 9-4"/>'),
  xray: icon('<path d="M12 3v18"/><path d="M12 7c-3 0-6 1-6 3M12 7c3 0 6 1 6 3M12 11c-3 0-6 1-6 3M12 11c3 0 6 1 6 3M12 15c-2.5 0-5 1-5 2.5M12 15c2.5 0 5 1 5 2.5"/>'),
  dna: icon('<path d="M7 3c0 4.5 10 4.5 10 9s-10 4.5-10 9"/><path d="M17 3c0 4.5-10 4.5-10 9s10 4.5 10 9"/><path d="M8.5 6h7M8.5 18h7"/>'),
  cells: icon('<circle cx="12" cy="12" r="8.5"/><circle cx="13" cy="11" r="3"/><circle cx="8" cy="15.5" r="1"/>'),
  neurons: icon('<circle cx="12" cy="12" r="2.5"/><path d="M12 9.5V4M9.8 13.2 5 17M14.2 13.2 19 17M12 4l-2.5-1.5M12 4l2.5-1.5M5 17l-.5 3M19 17l.5 3"/>'),
  heartbeat: icon('<path d="M2 12h5l2-5 3.5 11 2.5-6h7"/>'),
  vessels: icon('<path d="M12 21v-7M12 14l-5-5M12 14l5-5M7 9V4M7 9 3.5 7M17 9l3.5-3M17 9v-5"/>'),
  molecules: icon('<circle cx="12" cy="12" r="2.5"/><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="20" r="1.8"/><path d="M10.2 10.4 6.5 7.4M13.8 10.4l3.7-3M12 14.5v3.7"/>'),
  ultrasound: icon('<path d="M12 5 5 17a9.5 9.5 0 0 0 14 0z"/><path d="M8.6 13a6 6 0 0 0 6.8 0"/><path d="M9.5 3h5"/>'),
  pacs: icon('<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M5 9h14M5 15h14M8 6h.01M8 12h.01M8 18h.01M12 6h4M12 12h4M12 18h4"/>'),
  voxels: icon('<path d="M12 3 4 7.5v9L12 21l8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>'),
  hospital: icon('<path d="M4 21V8h16v13M2 21h20"/><path d="M12 10.5v6M9 13.5h6"/><path d="M9 8V4h6v4"/>'),
  lungs: icon('<path d="M12 3v8M12 11l-3 2M12 11l3 2"/><path d="M9 7.5C6.5 7.5 4 12 4 17c0 2 1 3 3 3s3-1 3-3V10"/><path d="M15 7.5c2.5 0 5 4.5 5 9.5 0 2-1 3-3 3s-3-1-3-3V10"/>'),
  spine: icon('<rect x="9" y="2" width="6" height="3" rx="1"/><rect x="9" y="6.5" width="6" height="3" rx="1"/><rect x="9" y="11" width="6" height="3" rx="1"/><rect x="9" y="15.5" width="6" height="3" rx="1"/><path d="M10 21h4M6.5 7.5 9 8M17.5 7.5 15 8M6.5 12.5 9 12.5M17.5 12.5 15 12.5"/>'),
  endoscope: icon('<path d="M3 20c4-1 5-4 6-7s3-6 7-7"/><circle cx="18" cy="6" r="3"/>'),
  petscan: icon('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 12l6-6M12 12l-6 6"/>'),
  linac: icon('<path d="M5 3h9v6H9v4"/><path d="M9 13l-2 4h4z"/><path d="M3 20h18"/><path d="M14 17h6"/>'),
};
