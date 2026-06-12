export const SECTIONS = [
  { id: 'ideas', name: 'Ideas', color: '#4A90D9' },
  { id: 'work-memories', name: 'Work Memories', color: '#7B68EE' },
  { id: 'development-memories', name: 'Development Memories', color: '#50C878' },
  { id: 'investigation-memories', name: 'Investigation Memories', color: '#FF6B6B' },
  { id: 'miscellaneous-memories', name: 'Miscellaneous Memories', color: '#FFB347' },
  { id: 'people-teams', name: 'People & Teams', color: '#DDA0DD' },
  { id: 'skill-building', name: 'Skill Building', color: '#20B2AA' },
  { id: 'tasks-specs', name: 'Tasks & Specs', color: '#E07C4F' },
];

export const VALID_SECTION_NAMES = SECTIONS.map(s => s.name);

export const KNOWLEDGE_TYPES = ['fact', 'concept', 'process', 'procedure', 'principle'];

export function sectionNameToFolderName(sectionName) {
  const section = SECTIONS.find(s => s.name === sectionName);
  return section ? section.id : null;
}

export function folderNameToSectionName(folderId) {
  const section = SECTIONS.find(s => s.id === folderId);
  return section ? section.name : null;
}
