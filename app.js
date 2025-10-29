// UI refs
const els = {
  baseUrl: document.getElementById('baseUrl'),
  foldersPath: document.getElementById('foldersPath'),
  applyPath: document.getElementById('applyPath'),
  apiKey: document.getElementById('apiKey'),
  folderSel: document.getElementById('inFolder'),
  inFrom: document.getElementById('inFrom'),
  inFromContains: document.getElementById('inFromContains'),
  inSubject: document.getElementById('inSubject'),
  inAction: document.getElementById('inAction'),
  tblBody: document.querySelector('#tblRules tbody'),
  ruleCount: document.getElementById('ruleCount'),
  payload: document.getElementById('payload'),
  response: document.getElementById('response'),
  status: document.getElementById('status'),
  btnAdd: document.getElementById('btnAdd'),
  btnApply: document.getElementById('btnApply'),
  btnClear: document.getElementById('btnClear'),
  btnSaveCfg: document.getElementById('btnSaveCfg'),
  btnLoadFolders: document.getElementById('btnLoadFolders'),
  toast: document.getElementById('toast'),
};

// UX helpers
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.style.opacity = '1';
  setTimeout(() => (els.toast.style.opacity = '0'), 1800);
}
function setStatus(text, kind = '') {
  els.status.textContent = text;
  els.status.className = 'pill ' + (kind === 'ok' ? 'ok' : kind === 'err' ? 'err' : '');
}

// Config persistence
function saveCfg() {
  localStorage.setItem(
    'cfg_n8n_rules',
    JSON.stringify({
      baseUrl: els.baseUrl.value.trim(),
      foldersPath: els.foldersPath.value.trim(),
      applyPath: els.applyPath.value.trim(),
      apiKey: els.apiKey.value.trim(),
    }),
  );
  setStatus('config guardada', 'ok');
  toast('Config guardada');
}
function loadCfg() {
  const raw = localStorage.getItem('cfg_n8n_rules');
  if (!raw) return;
  try {
    const c = JSON.parse(raw);
    els.baseUrl.value = c.baseUrl || '';
    els.foldersPath.value = c.foldersPath || '/webhook/powerapp/folders';
    els.applyPath.value = c.applyPath || '/webhook/powerapp/apply';
    els.apiKey.value = c.apiKey || '';
  } catch (_) {}
}

// Net utils
function buildUrl(path) {
  const base = els.baseUrl.value.trim().replace(/\/+$/, '');
  if (!base) throw new Error('Base URL vacía');
  return base + path;
}
function buildHeaders() {
  const h = {};
  const k = els.apiKey.value.trim();
  if (k) {
    const [name, ...rest] = k.split(/\s+/);
    if (rest.length) h[name] = rest.join(' ');
    else h['X-API-Key'] = k;
  }
  return h;
}
function prettifyOrRaw(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Rules table
let rules = [];
function refreshTable() {
  els.tblBody.innerHTML = '';
  rules.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="mono">${escapeHtml(r.from || '')}</td>
      <td class="mono">${escapeHtml(r.fromContains || '')}</td>
      <td class="mono">${escapeHtml(r.subjectContains || '')}</td>
      <td class="mono">${escapeHtml(r.targetFolder || '')}</td>
      <td><span class="pill ${r.action === 'copy' ? 'ok' : ''}">${r.action}</span></td>
      <td class="right"><button class="secondary" data-del="${i}">✕</button></td>`;
    els.tblBody.appendChild(tr);
  });
  els.ruleCount.textContent = String(rules.length);
  els.payload.value = JSON.stringify({ rules }, null, 2);
}
els.tblBody.addEventListener('click', e => {
  const i = e.target.getAttribute('data-del');
  if (i !== null) {
    rules.splice(Number(i), 1);
    refreshTable();
    setStatus('regla eliminada');
    toast('Regla eliminada');
  }
});

// Actions
async function loadFolders() {
  try {
    setStatus('cargando carpetas…');
    const res = await fetch(buildUrl(els.foldersPath.value), { headers: buildHeaders() });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const folders = (data.folders || []).sort((a, b) => a.name.localeCompare(b.name));
    els.folderSel.innerHTML = '<option value="">— selecciona —</option>';
    folders.forEach(f => {
      const o = document.createElement('option');
      o.value = f.name; // el workflow mapea nombre→id
      o.textContent = f.name;
      els.folderSel.appendChild(o);
    });
    if (folders.length === 0) {
      setStatus('no se encontraron carpetas', 'err');
      toast('No se encontraron carpetas');
    } else {
      setStatus('carpetas cargadas', 'ok');
      toast('Carpetas cargadas');
    }
  } catch (_) {
    setStatus('error al cargar carpetas', 'err');
    toast('Error al cargar carpetas');
  }
}

function addRule() {
  const r = {
    from: els.inFrom.value.trim(),
    fromContains: els.inFromContains.value.trim(),
    subjectContains: els.inSubject.value.trim(),
    targetFolder: els.folderSel.value,
    action: els.inAction.value,
  };
  if (!r.targetFolder) {
    setStatus('elige carpeta', 'err');
    toast('Elige carpeta');
    return;
  }
  if (!r.from && !r.fromContains && !r.subjectContains) {
    setStatus('define criterio', 'err');
    toast('Define al menos un criterio');
    return;
  }
  rules.push(r);
  refreshTable();
  setStatus('regla agregada', 'ok');
  toast('Regla agregada');
}

async function applyRules() {
  try {
    if (!rules.length) {
      setStatus('sin reglas', 'err');
      toast('Sin reglas');
      return;
    }
    setStatus('enviando…');
    const res = await fetch(buildUrl(els.applyPath.value), {
      method: 'POST',
      headers: { ...buildHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules }),
    });
    const text = await res.text();
    els.response.value = prettifyOrRaw(text);
    if (res.ok) {
      setStatus('aplicado', 'ok');
      toast('Reglas aplicadas');
    } else {
      setStatus('error', 'err');
      toast('Error al aplicar reglas');
    }
  } catch (_) {
    setStatus('error en envío', 'err');
    toast('Error en envío');
  }
}

// Wire-up
document.getElementById('btnSaveCfg').addEventListener('click', saveCfg);
document.getElementById('btnLoadFolders').addEventListener('click', loadFolders);
document.getElementById('btnAdd').addEventListener('click', addRule);
document.getElementById('btnClear').addEventListener('click', () => {
  rules = [];
  refreshTable();
  setStatus('limpiado');
  toast('Limpio');
});
document.getElementById('btnApply').addEventListener('click', applyRules);

// Init
loadCfg();
refreshTable();

