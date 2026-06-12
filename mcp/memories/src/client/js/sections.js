import { getSections } from './api.js';
import { isNetworkOpen, filterBySection } from './network.js';

const SECTION_COLORS = {
  'ideas': '#4A90D9',
  'work-memories': '#7B68EE',
  'development-memories': '#50C878',
  'investigation-memories': '#FF6B6B',
  'miscellaneous-memories': '#FFB347',
  'people-teams': '#DDA0DD',
  'skill-building': '#20B2AA',
};

let sections = [];
let activeSection = null;
let onSectionChange = null;

export function getSectionColor(sectionIdOrName) {
  if (SECTION_COLORS[sectionIdOrName]) return SECTION_COLORS[sectionIdOrName];
  const s = sections.find(s => s.name === sectionIdOrName || s.id === sectionIdOrName);
  return s ? s.color : '#999';
}

export function getSectionsList() {
  return sections;
}

export function getActiveSection() {
  return activeSection;
}

export function setOnSectionChange(cb) {
  onSectionChange = cb;
}

function renderSections() {
  const list = document.getElementById('section-list');
  list.innerHTML = '';

  // "All" item
  const allLi = document.createElement('li');
  allLi.className = `section-item${activeSection === null ? ' active' : ''}`;
  allLi.innerHTML = `
    <span class="section-color-dot" style="background: linear-gradient(135deg, #4A90D9, #FF6B6B, #20B2AA)"></span>
    <span class="section-name">All Memories</span>
  `;
  allLi.addEventListener('click', () => selectSection(null));
  allLi.setAttribute('data-section-id', 'all');
  list.appendChild(allLi);

  for (const section of sections) {
    const li = document.createElement('li');
    li.className = `section-item${activeSection === section.name ? ' active' : ''}`;
    li.innerHTML = `
      <span class="section-color-dot" style="background: ${section.color}"></span>
      <span class="section-name">${section.name}</span>
    `;
    li.addEventListener('click', () => selectSection(section.name));
    li.setAttribute('data-section-id', section.id);
    li.setAttribute('data-section-name', section.name);

    // Drop target for drag-and-drop
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      li.classList.add('drop-target');
    });
    li.addEventListener('dragleave', () => {
      li.classList.remove('drop-target');
    });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      li.classList.remove('drop-target');
      const memoryId = e.dataTransfer.getData('text/memory-id');
      if (memoryId && window.__onDropToSection) {
        window.__onDropToSection(memoryId, section);
      }
    });

    list.appendChild(li);
  }
}

export function selectSection(sectionName) {
  activeSection = sectionName;
  renderSections();

  if (isNetworkOpen()) {
    // Find the section id for filtering
    const sec = sections.find(s => s.name === sectionName);
    filterBySection(sec ? sec.id : null);
    return;
  }

  if (onSectionChange) onSectionChange(sectionName);
}

export async function initSections() {
  try {
    const data = await getSections();
    sections = data.sections || [];
    renderSections();
  } catch (e) {
    console.error('Failed to load sections:', e);
  }
}
