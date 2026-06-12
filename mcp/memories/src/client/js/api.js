const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

// Sections
export function getSections() {
  return request('/sections');
}

// Memories
export function getMemories(params = {}) {
  const q = new URLSearchParams();
  if (params.section) q.set('section', params.section);
  if (params.tag) q.set('tag', params.tag);
  const qs = q.toString();
  return request(`/memories${qs ? '?' + qs : ''}`);
}

export function getMemory(id) {
  return request(`/memories/${encodeURIComponent(id)}`);
}

export function createMemory(data) {
  return request('/memories', { method: 'POST', body: JSON.stringify(data) });
}

export function updateMemory(id, data) {
  return request(`/memories/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteMemory(id) {
  return request(`/memories/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function bulkDeleteMemories(ids) {
  return request('/memories/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });
}

// Links
export function getLinks(id) {
  return request(`/memories/${encodeURIComponent(id)}/links`);
}

export function addLink(id, targetId) {
  return request(`/memories/${encodeURIComponent(id)}/links`, {
    method: 'POST', body: JSON.stringify({ targetId }),
  });
}

export function deleteLink(id, targetId) {
  return request(`/memories/${encodeURIComponent(id)}/links/${encodeURIComponent(targetId)}`, {
    method: 'DELETE',
  });
}

// Search
export function search(q, params = {}) {
  const qs = new URLSearchParams({ q });
  if (params.section) qs.set('section', params.section);
  if (params.limit) qs.set('limit', params.limit);
  return request(`/search?${qs.toString()}`);
}

// Tags
export function getTags() {
  return request('/tags');
}

// Network
export function getNetwork() {
  return request('/network');
}

// Skills
export function getSkillsCoverage(tag) {
  const qs = tag ? `?tag=${encodeURIComponent(tag)}` : '';
  return request(`/skills/coverage${qs}`);
}

// Settings
export function getSettings() {
  return request('/settings');
}

export function updateSettings(data) {
  return request('/settings', { method: 'PUT', body: JSON.stringify(data) });
}

// Models
export function getModels() {
  return request('/models');
}

export function downloadModel(id) {
  return request(`/models/${encodeURIComponent(id)}/download`, { method: 'POST' });
}

// Semantic Index
export function getSemanticIndexStatus() {
  return request('/semantic-index/status');
}

export function rebuildSemanticIndex() {
  return request('/semantic-index/rebuild', { method: 'POST' });
}
