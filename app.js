// Global state
let cvValues = {};
let manufacturers = [];
let detailedManufacturers = [];
let currentFile = "";
let currentResetCommand = "8=8";

// DOM Elements
let fileSelectionScreen, programmingScreen, backBtn, resetBtn, cvGroupsContainer, decoderNameEl, firmwareInfoEl, groupNav;
let resetModal, resetConfirmBtn, resetCancelBtn, resetModalText;
let manufacturerListEl, decoderListEl, searchInput, searchResultsEl, resManufacturerEl, resDecoderBtn, resDecoderList;

async function init() {
    fileSelectionScreen = document.getElementById('file-selection');
    programmingScreen = document.getElementById('programming-screen');
    backBtn = document.getElementById('back-btn');
    resetBtn = document.getElementById('reset-btn');
    cvGroupsContainer = document.getElementById('cv-groups');
    groupNav = document.getElementById('group-nav');
    decoderNameEl = document.getElementById('decoder-name');
    firmwareInfoEl = document.getElementById('firmware-info');

    resetModal = document.getElementById('reset-modal');
    resetConfirmBtn = document.getElementById('reset-confirm');
    resetCancelBtn = document.getElementById('reset-cancel');
    resetModalText = document.getElementById('reset-modal-text');

    manufacturerListEl = document.getElementById('manufacturer-list');
    decoderListEl = document.getElementById('decoder-list');
    searchInput = document.getElementById('decoder-search');
    searchResultsEl = document.getElementById('search-results');
    resManufacturerEl = document.getElementById('res-manufacturer');
    resDecoderBtn = document.getElementById('res-decoder-btn');
    resDecoderList = document.getElementById('res-decoder-list');

    await loadData();
    renderManufacturers();
    
    const filterType = document.getElementById('filter-type');
    const filterProduction = document.getElementById('filter-production');
    const filterCurrent = document.getElementById('filter-current');
    const filterVoltage = document.getElementById('filter-voltage');
    const filterFa = document.getElementById('filter-fa');
    const filterLength = document.getElementById('filter-length');
    const filterWidth = document.getElementById('filter-width');
    const filterHeight = document.getElementById('filter-height');
    const clearFiltersBtn = document.getElementById('clear-filters');
    const resultsTableContainer = document.getElementById('results-table-container');
    const resultsTbody = document.getElementById('results-tbody');
    const manualSelectionContainer = document.getElementById('manual-selection-container');

    searchInput.addEventListener('input', handleSearch);
    
    const filterEls = [filterType, filterProduction, filterCurrent, filterVoltage, filterFa, filterLength, filterWidth, filterHeight];
    filterEls.forEach(el => {
        el.addEventListener('input', () => {
            const results = applyFilters();
            renderResultsTable(results);
        });
    });

    clearFiltersBtn.addEventListener('click', () => {
        filterEls.forEach(el => el.value = '');
        renderResultsTable([]);
        manualSelectionContainer.style.display = 'grid';
        resultsTableContainer.style.display = 'none';
    });

    backBtn.addEventListener('click', showFileSelection);
    resetBtn.addEventListener('click', handleReset);
    resetCancelBtn.addEventListener('click', () => resetModal.style.display = 'none');
    resetConfirmBtn.addEventListener('click', performReset);

    window.addEventListener('resize', () => {
        document.querySelectorAll('.speed-curve-canvas').forEach(c => drawSpeedCurve(c));
    });
}

function applyFilters() {
    const fType = document.getElementById('filter-type').value;
    const fProd = document.getElementById('filter-production').value;
    const fCurrent = parseFloat(document.getElementById('filter-current').value) || 0;
    const fVoltage = parseFloat(document.getElementById('filter-voltage').value) || 0;
    const fFa = parseInt(document.getElementById('filter-fa').value) || 0;
    const fLength = parseFloat(document.getElementById('filter-length').value) || Infinity;
    const fWidth = parseFloat(document.getElementById('filter-width').value) || Infinity;
    const fHeight = parseFloat(document.getElementById('filter-height').value) || Infinity;

    const isFiltering = fType || fProd || fCurrent || fVoltage || fFa || fLength !== Infinity || fWidth !== Infinity || fHeight !== Infinity;

    if (!isFiltering) return [];

    let results = [];
    detailedManufacturers.forEach(m => {
        if (!m.decoder) return;
        m.decoder.forEach(d => {
            const matchType = !fType || d.type === fType;
            const matchProd = !fProd || String(d.in_production) === fProd;
            const matchCurrent = (d.max_current || 0) >= fCurrent;
            const matchVoltage = (d.max_voltage || 0) >= fVoltage;
            const matchFa = (d.fa_count || 0) >= fFa;
            const matchLength = (d.length || Infinity) <= fLength;
            const matchWidth = (d.width || Infinity) <= fWidth;
            const matchHeight = (d.height || Infinity) <= fHeight;

            if (matchType && matchProd && matchCurrent && matchVoltage && matchFa && matchLength && matchWidth && matchHeight) {
                results.push({ manufacturer: m, decoder: d });
            }
        });
    });
    return results;
}

function renderResultsTable(results) {
    const container = document.getElementById('results-table-container');
    const tbody = document.getElementById('results-tbody');
    const manualContainer = document.getElementById('manual-selection-container');

    if (results.length === 0 && !isFilteringActive()) {
        container.style.display = 'none';
        manualContainer.style.display = 'grid';
        return;
    }

    container.style.display = 'block';
    manualContainer.style.display = 'none';
    tbody.innerHTML = '';

    results.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.manufacturer.name}</td>
            <td>${item.decoder.name}</td>
            <td>${item.decoder.type || '-'}</td>
            <td class="${item.decoder.in_production ? 'in-prod' : 'out-prod'}">${item.decoder.in_production ? '✔' : '✘'}</td>
            <td>${item.decoder.max_current || 0}A</td>
            <td>${item.decoder.max_voltage || 0}V</td>
            <td>${item.decoder.fa_count || 0}</td>
            <td>${item.decoder.length || 0}</td>
            <td>${item.decoder.width || 0}</td>
            <td>${item.decoder.height || 0}</td>
        `;
        tr.onclick = () => loadDecoder(item.manufacturer, item.decoder);
        tbody.appendChild(tr);
    });

    if (results.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 2rem;">Keine Treffer für die gewählten Filter.</td></tr>';
    }
}

function isFilteringActive() {
    return ['filter-type', 'filter-production', 'filter-current', 'filter-voltage', 'filter-fa', 'filter-length', 'filter-width', 'filter-height']
        .some(id => document.getElementById(id).value !== '');
}

async function loadData() {
    try {
        const [mResp, dResp] = await Promise.all([
            fetch('decoder/hersteller.json'),
            fetch('decoder/hersteller_detailed.json')
        ]);
        if (mResp.ok) manufacturers = await mResp.json();
        if (dResp.ok) detailedManufacturers = await dResp.json();
    } catch (e) {
        console.warn("Stammdaten konnten nicht geladen werden:", e);
    }
}

function renderManufacturers() {
    manufacturerListEl.innerHTML = '';
    // Nur Hersteller anzeigen, die mindestens einen Decoder haben
    const activeManufacturers = detailedManufacturers.filter(m => m.decoder && m.decoder.length > 0);
    
    activeManufacturers.forEach(m => {
        const item = document.createElement('div');
        item.className = 'nav-list-item';
        item.textContent = m.name;
        item.onclick = () => {
            document.querySelectorAll('#manufacturer-list .nav-list-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            renderDecoders(m);
        };
        manufacturerListEl.appendChild(item);
    });
}

function renderDecoders(manufacturer) {
    decoderListEl.innerHTML = '';
    decoderListEl.classList.remove('empty');
    
    if (!manufacturer.decoder || manufacturer.decoder.length === 0) {
        decoderListEl.innerHTML = '<p class="placeholder">Keine Decoder für diesen Hersteller gefunden.</p>';
        decoderListEl.classList.add('empty');
        return;
    }

    manufacturer.decoder.forEach(d => {
        const item = document.createElement('div');
        item.className = 'nav-list-item';
        item.textContent = d.name;
        item.onclick = () => loadDecoder(manufacturer, d);
        decoderListEl.appendChild(item);
    });
}

function handleSearch() {
    const term = searchInput.value.toLowerCase().trim();
    if (!term) {
        searchResultsEl.style.display = 'none';
        return;
    }

    let hits = [];
    detailedManufacturers.forEach(m => {
        const matches = m.decoder.filter(d => d.name.toLowerCase().includes(term));
        if (matches.length > 0) {
            hits.push({ manufacturer: m, decoders: matches });
        }
    });

    if (hits.length > 0) {
        searchResultsEl.style.display = 'block';
        const bestHit = hits[0];
        resManufacturerEl.textContent = bestHit.manufacturer.name;
        resDecoderBtn.textContent = `${bestHit.decoders.length} Treffer...`;
        
        resDecoderList.innerHTML = '';
        bestHit.decoders.forEach(d => {
            const a = document.createElement('a');
            a.href = '#';
            a.textContent = d.name;
            a.onclick = (e) => {
                e.preventDefault();
                loadDecoder(bestHit.manufacturer, d);
                searchResultsEl.style.display = 'none';
                searchInput.value = d.name;
            };
            resDecoderList.appendChild(a);
        });
    } else {
        searchResultsEl.style.display = 'none';
    }
}

async function loadDecoder(manufacturer, decoder) {
    let fileUrl = decoder.latest_firmware_file_url;
    
    if (fileUrl) {
        console.log(`Versuche Live-Laden von: ${fileUrl}`);
        // Umgehe CORS-Probleme mit einem Proxy (allorigins.win ist oft zuverlässig)
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(fileUrl)}`;
        await loadDecoderFile(proxyUrl, true);
        return;
    }

    // Fallback: Suche in lokalen Dateien wie bisher
    const mInfo = manufacturers.find(m => 
        manufacturer.name.toLowerCase().includes(m.name.toLowerCase()) || 
        m.name.toLowerCase().includes(manufacturer.name.toLowerCase())
    );
    const mId = mInfo ? mInfo.id : null;
    
    let fwId = null;
    if (decoder.latest_firmware_url) {
        const parts = decoder.latest_firmware_url.split('-');
        if (parts.length >= 2) fwId = parts[parts.length - 2];
    }

    console.log(`Suche lokale Datei für M-ID: ${mId}, FW-ID: ${fwId}`);
    let fileName = (mId && fwId) ? decoderFiles.find(f => f.includes(`_${mId}_`) && f.includes(`_${fwId}.`)) : null;
    if (!fileName && mId) fileName = decoderFiles.find(f => f.includes(`_${mId}_`));

    if (fileName) {
        await loadDecoderFile(`decoder/${fileName}`);
    } else {
        alert(`Keine passende Decoder-Beschreibungsdatei gefunden.\n\nLive-URL: ${fileUrl || 'Nicht verfügbar'}\nLokale Suche: Fehlgeschlagen`);
    }
}

async function loadDecoderFile(url, isRemote = false) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP-Status ${response.status}`);
        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        
        if (xmlDoc.getElementsByTagName("parsererror").length > 0) throw new Error("XML-Formatfehler.");

        parseAndRenderDecoder(xmlDoc);
        showProgrammingScreen();
    } catch (error) {
        console.error("Ladefehler:", error);
        alert(`Fehler beim Laden: ${error.message}${isRemote ? '\n(Möglicherweise CORS-Einschränkung)' : ''}`);
    }
}

function handleReset() {
    if (!currentResetCommand) return;
    const [cv, val] = currentResetCommand.split('=');
    resetModalText.innerHTML = `Möchten Sie den Decoder wirklich auf Werkseinstellungen zurücksetzen?<br><br><strong>Befehl: CV ${cv} = ${val}</strong>`;
    resetModal.style.display = 'flex';
}

function performReset() {
    resetModal.style.display = 'none';
    const [cv, val] = currentResetCommand.split('=');
    alert(`Reset-Befehl (CV ${cv} = ${val}) gesendet!`);
}

function parseAndRenderDecoder(xmlDoc) {
    const getCTElement = (parent, name) => {
        const directMatch = Array.from(parent.children).find(c => 
            c.tagName === 'ct:' + name || c.tagName === name || c.tagName.endsWith(':' + name)
        );
        if (directMatch) return directMatch;
        return parent.getElementsByTagName('ct:' + name)[0] || parent.getElementsByTagName(name)[0];
    };

    cvValues = {};
    const firmware = xmlDoc.getElementsByTagName('firmware')[0];
    const decoders = xmlDoc.getElementsByTagName('decoders')[0]?.getElementsByTagName('decoder');
    decoderNameEl.textContent = decoders ? Array.from(decoders).map(d => d.getAttribute('name')).join(', ') : "Unbekannter Decoder";
    
    const mId = firmware?.getAttribute('manufacturerId');
    const m = manufacturers.find(item => item.id == mId);
    const mName = m ? `${m.name} (ID: ${mId})` : mId;
    
    const resetNode = xmlDoc.getElementsByTagName('reset')[0];
    currentResetCommand = resetNode ? `${resetNode.getAttribute('cv')}=${resetNode.getAttribute('value')}` : "8=8";
    
    firmwareInfoEl.textContent = `Firmware Version: ${firmware?.getAttribute('version') || '?'} | Hersteller: ${mName}`;
    cvGroupsContainer.innerHTML = '';
    groupNav.innerHTML = '<h4>Gruppen</h4>';

    // Standard DCC Group
    const standardGroup = createGroupElement("Standard-DCC-Variablen");
    standardGroup.id = "group-standard";
    const standardNav = document.createElement('a');
    standardNav.className = 'nav-item active';
    standardNav.textContent = "Standard-DCC-Variablen";
    standardNav.onclick = () => {
        standardGroup.classList.remove('collapsed');
        standardGroup.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        standardNav.classList.add('active');
    };
    groupNav.appendChild(standardNav);
    cvGroupsContainer.appendChild(standardGroup);

    const hint = document.createElement('div');
    hint.className = 'group-hint';
    hint.textContent = "Diese Standard-CVs treten in den jeweiligen Gruppen erneut auf, sind hier aber wegen ihres herstellerübergreifenden Charakters aufgeführt.";
    standardGroup.querySelector('.cv-group-content').appendChild(hint);

    const standardNumbers = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '19', '29'];
    const standardCvs = Array.from(xmlDoc.getElementsByTagName('ct:cv'));
    
    standardNumbers.forEach(num => {
        const cv = standardCvs.find(n => n.getAttribute('number') === num);
        if (cv) standardGroup.querySelector('.cv-group-content').appendChild(createCvRow(cv, getCTElement));
    });

    const longAddrGroup = Array.from(xmlDoc.getElementsByTagName('ct:cvGroup')).find(g => g.getAttribute('type') === 'dccLongAddr');
    if (longAddrGroup) standardGroup.querySelector('.cv-group-content').appendChild(createLongAddrRow(longAddrGroup, getCTElement));

    const speedCurveGroupNode = Array.from(xmlDoc.getElementsByTagName('ct:cvGroup')).find(g => g.getAttribute('type') === 'dccSpeedCurve');
    if (speedCurveGroupNode) {
        const title = speedCurveGroupNode.querySelector('description, ct\\:description')?.getAttribute('text') || "Geschwindigkeitskurve";
        const groupEl = createGroupElement(title);
        groupEl.id = `group-speed-curve`;
        
        const navItem = document.createElement('a');
        navItem.className = 'nav-item';
        navItem.textContent = title;
        navItem.onclick = () => {
            groupEl.classList.remove('collapsed');
            groupEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            navItem.classList.add('active');
        };
        groupNav.appendChild(navItem);
        
        initSpeedCurveChart(groupEl, speedCurveGroupNode, getCTElement);
        Array.from(speedCurveGroupNode.querySelectorAll('cv, ct\\:cv')).forEach(cv => {
            groupEl.querySelector('.cv-group-content').appendChild(createCvRow(cv, getCTElement));
        });
        cvGroupsContainer.appendChild(groupEl);
    }

    const cvsContainer = xmlDoc.getElementsByTagName('cvs')[0] || xmlDoc.getElementsByTagName('ct:cvs')[0];
    let generalGroup = null;
    let groupIndex = 0;

    if (cvsContainer) {
        Array.from(cvsContainer.children).forEach(child => {
            const tagName = child.tagName.toLowerCase();
            if (tagName.endsWith('cvgroup')) {
                const type = child.getAttribute('type');
                if (type === 'dccSpeedCurve') return;

                const title = child.querySelector('description, ct\\:description')?.getAttribute('text') || `Gruppe ${groupIndex + 1}`;
                const groupEl = createGroupElement(title);
                groupEl.id = `group-${groupIndex++}`;
                
                const navItem = document.createElement('a');
                navItem.className = 'nav-item';
                navItem.textContent = title;
                navItem.onclick = () => {
                    groupEl.classList.remove('collapsed');
                    groupEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                    navItem.classList.add('active');
                };
                groupNav.appendChild(navItem);

                if (type === 'dccLongAddr') {
                    groupEl.querySelector('.cv-group-content').appendChild(createLongAddrRow(child, getCTElement));
                } else {
                    Array.from(child.querySelectorAll('cv, ct\\:cv')).forEach(cv => {
                        groupEl.querySelector('.cv-group-content').appendChild(createCvRow(cv, getCTElement));
                    });
                }
                cvGroupsContainer.appendChild(groupEl);
            } else if (tagName.endsWith('cv')) {
                if (!generalGroup) {
                    generalGroup = createGroupElement("Allgemeine Einstellungen");
                    generalGroup.id = "group-general";
                    const navItem = document.createElement('a');
                    navItem.className = 'nav-item';
                    navItem.textContent = "Allgemeine Einstellungen";
                    navItem.onclick = () => {
                        generalGroup.classList.remove('collapsed');
                        generalGroup.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    };
                    groupNav.appendChild(navItem);
                    cvGroupsContainer.appendChild(generalGroup);
                }
                generalGroup.querySelector('.cv-group-content').appendChild(createCvRow(child, getCTElement));
            }
        });
    }
    updateDependencies();
}

function createLongAddrRow(groupNode, getCTElement) {
    const row = document.createElement('div');
    row.className = 'cv-row';
    const description = getCTElement(groupNode, 'description')?.getAttribute('text') || "Lange Adresse";
    const cv17Node = Array.from(groupNode.querySelectorAll('cv, ct\\:cv')).find(n => n.getAttribute('number') == '17');
    const cv18Node = Array.from(groupNode.querySelectorAll('cv, ct\\:cv')).find(n => n.getAttribute('number') == '18');
    const def17 = parseInt(cv17Node?.getAttribute('defaultValue') || '192');
    const def18 = parseInt(cv18Node?.getAttribute('defaultValue') || '3');
    cvValues[17] = def17; cvValues[18] = def18;
    
    row.innerHTML = `
        <div class="cv-number">CV 17/18</div>
        <div class="cv-name">
            <div class="cv-desc-text">${description}</div>
            <div class="cv-help-text">Werte von 1 bis 10239.</div>
        </div>
        <div class="cv-value-container">
            <input type="number" class="cv-value-input long-addr-input" value="${((def17 & 63) << 8) + def18}" min="1" max="10239">
        </div>
        <div class="cv-actions">
            <button class="btn-sm btn-read" title="Lesen"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></button>
            <button class="btn-sm btn-write" title="Schreiben"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg></button>
        </div>
    `;

    row.querySelector('.long-addr-input').oninput = (e) => {
        let addr = parseInt(e.target.value) || 0;
        addr = Math.max(0, Math.min(10239, addr));
        cvValues[17] = (addr >> 8) | 192;
        cvValues[18] = addr & 255;
        updateDependencies();
    };
    return row;
}

function createGroupElement(title) {
    const div = document.createElement('div');
    div.className = 'cv-group collapsed';
    div.innerHTML = `
        <div class="cv-group-header"><span class="cv-group-title">${title}</span><span class="cv-group-icon">▼</span></div>
        <div class="cv-group-content"></div>
    `;
    div.querySelector('.cv-group-header').onclick = () => div.classList.toggle('collapsed');
    return div;
}

function createCvRow(cvNode, getCTElement) {
    const number = cvNode.getAttribute('number');
    const defaultValue = cvNode.getAttribute('defaultValue') || '0';
    const mode = cvNode.getAttribute('mode') || 'rw';
    const isReadOnly = mode === 'ro';
    cvValues[number] = parseInt(defaultValue);

    const descNode = getCTElement(cvNode, 'description');
    const description = descNode?.getAttribute('text') || "Keine Beschreibung";
    const helpText = descNode?.getAttribute('help');
    const calcNode = getCTElement(cvNode, 'valueCalculation');
    const unit = calcNode?.getAttribute('unit');

    const row = document.createElement('div');
    row.className = 'cv-row';
    row.setAttribute('data-cv', number);
    
    const conditionsNode = cvNode.getElementsByTagName('ct:conditions')[0];
    if (conditionsNode) { row.setAttribute('data-has-conditions', 'true'); row.conditions = conditionsNode; }

    const bitNodes = Array.from(cvNode.querySelectorAll('bit, bitSelection, ct\\:bit, ct\\:bitSelection'));
    let bitsHtml = bitNodes.length > 0 ? '<div class="bit-container">' + bitNodes.map(bn => {
        const bitNum = bn.getAttribute('number');
        if (bn.tagName.toLowerCase().includes('bitselection')) {
            const opts = Array.from(bn.querySelectorAll('option, ct\\:option')).map(o => `<option value="${o.getAttribute('value')}">${(getCTElement(o, 'description') || o).getAttribute('text') || 'Wert'}</option>`).join('');
            return `<div class="bit-item selection"><select class="bit-select" data-bit="${bitNum}">${opts}</select></div>`;
        }
        return `<label class="bit-item"><input type="checkbox" data-bit="${bitNum}" class="bit-checkbox"><span>${(getCTElement(bn, 'description') || bn).getAttribute('text') || 'Bit ' + bitNum}</span></label>`;
    }).join('') + '</div>' : '';

    const topLevelOptions = Array.from(cvNode.children).filter(c => c.tagName.toLowerCase().endsWith('option'));
    const topLevelGroups = Array.from(cvNode.children).filter(c => c.tagName.toLowerCase().endsWith('group'));
    const isEnum = topLevelOptions.length > 0 || topLevelGroups.length > 0;
    
    let valueSelectorHtml = '';
    if (isEnum) {
        let allOptions = [...topLevelOptions];
        topLevelGroups.forEach(g => allOptions.push(...Array.from(g.children).filter(c => c.tagName.toLowerCase().endsWith('option'))));
        valueSelectorHtml = `<select class="cv-value-select">${allOptions.map(o => `<option value="${o.getAttribute('value')}">${(getCTElement(o, 'description') || o).getAttribute('text') || 'Wert'}</option>`).join('')}</select>`;
    }

    row.innerHTML = `
        <div class="cv-number">CV ${number}</div>
        <div class="cv-name"><div class="cv-desc-text">${description} ${isReadOnly ? '<small>(RO)</small>' : ''}</div>${helpText ? `<div class="cv-help-text">${helpText}</div>` : ''}${bitsHtml}</div>
        <div class="cv-value-container"><div class="input-with-unit"><input type="text" class="cv-value-input" value="${defaultValue}" ${isReadOnly ? 'readonly' : ''}>${unit ? `<span class="unit-label">${unit}</span>` : ''}</div>${isEnum ? valueSelectorHtml : ''}</div>
        <div class="cv-actions"><button class="btn-sm btn-read" title="Lesen"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></button>${isReadOnly ? '' : `<button class="btn-sm btn-write" title="Schreiben"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg></button>`}</div>
    `;

    const input = row.querySelector('.cv-value-input');
    const valueSelect = row.querySelector('.cv-value-select');
    const checkboxes = row.querySelectorAll('.bit-checkbox');
    const bitSelects = row.querySelectorAll('.bit-select');

    const updateUIFromValue = (val) => {
        if (input) input.value = val;
        if (valueSelect) valueSelect.value = val;
        checkboxes.forEach(cb => cb.checked = (val & (1 << parseInt(cb.dataset.bit))) !== 0);
        bitSelects.forEach(sel => sel.value = (val & (1 << parseInt(sel.dataset.bit))) !== 0 ? "1" : "0");
    };

    updateUIFromValue(parseInt(defaultValue));

    if (input) input.oninput = (e) => {
        let val = Math.max(0, Math.min(255, parseInt(e.target.value) || 0));
        cvValues[number] = val; updateUIFromValue(val); updateDependencies();
        document.querySelectorAll('.speed-curve-canvas').forEach(c => drawSpeedCurve(c));
    };

    if (valueSelect) valueSelect.onchange = (e) => {
        let val = parseInt(e.target.value);
        cvValues[number] = val; updateUIFromValue(val); updateDependencies();
        document.querySelectorAll('.speed-curve-canvas').forEach(c => drawSpeedCurve(c));
    };

    checkboxes.forEach(cb => cb.onchange = () => {
        let baseVal = cvValues[number] || 0;
        const b = parseInt(cb.dataset.bit);
        if (cb.checked) baseVal |= (1 << b); else baseVal &= ~(1 << b);
        cvValues[number] = baseVal; updateUIFromValue(baseVal); updateDependencies();
        document.querySelectorAll('.speed-curve-canvas').forEach(c => drawSpeedCurve(c));
    });

    bitSelects.forEach(sel => sel.onchange = () => {
        let baseVal = cvValues[number] || 0;
        const b = parseInt(sel.dataset.bit);
        baseVal &= ~(1 << b); if (parseInt(sel.value) === 1) baseVal |= (1 << b);
        cvValues[number] = baseVal; updateUIFromValue(baseVal); updateDependencies();
        document.querySelectorAll('.speed-curve-canvas').forEach(c => drawSpeedCurve(c));
    });

    return row;
}

function initSpeedCurveChart(groupEl, groupNode, getCTElement) {
    const cvNumbers = Array.from(groupNode.getElementsByTagName('ct:cv')).map(c => c.getAttribute('number'));
    const container = document.createElement('div');
    container.className = 'speed-curve-container';
    container.innerHTML = `<canvas class="speed-curve-canvas"></canvas><div class="speed-curve-presets"><button class="btn-preset" data-type="linear">Linear</button><button class="btn-preset" data-type="exp">Exponentiell</button><button class="btn-preset" data-type="log">Logarithmisch</button></div>`;
    const canvas = container.querySelector('canvas');
    canvas.dataset.cvs = JSON.stringify(cvNumbers);
    groupEl.querySelector('.cv-group-content').appendChild(container);
    setTimeout(() => drawSpeedCurve(canvas), 100);

    const applyPreset = (type) => {
        const n = cvNumbers.length;
        cvNumbers.forEach((num, i) => {
            const x = i / (n - 1);
            const val = Math.round((type === 'linear' ? x : (type === 'exp' ? Math.pow(x, 1.8) : Math.pow(x, 0.5))) * 255);
            cvValues[num] = val;
            const inp = document.querySelector(`.cv-row[data-cv="${num}"] .cv-value-input`);
            if (inp) inp.value = val;
        });
        drawSpeedCurve(canvas); updateDependencies();
    };

    container.querySelector('.speed-curve-presets').onclick = (e) => { if (e.target.classList.contains('btn-preset')) applyPreset(e.target.dataset.type); };

    let isDragging = false;
    const handleMouse = (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left; const y = e.clientY - rect.top;
        const cvIdx = Math.round((x / canvas.clientWidth) * (cvNumbers.length - 1));
        const cvNum = cvNumbers[cvIdx];
        if (cvNum && isDragging) {
            let val = Math.max(0, Math.min(255, Math.round(255 - (y / canvas.clientHeight) * 255)));
            cvValues[cvNum] = val;
            const inp = document.querySelector(`.cv-row[data-cv="${cvNum}"] .cv-value-input`);
            if (inp) inp.value = val;
            drawSpeedCurve(canvas);
        }
    };
    canvas.onmousedown = (e) => { isDragging = true; handleMouse(e); };
    window.onmousemove = (e) => { if (isDragging) handleMouse(e); };
    window.onmouseup = () => isDragging = false;
}

function drawSpeedCurve(canvas) {
    const ctx = canvas.getContext('2d');
    const cvNumbers = JSON.parse(canvas.dataset.cvs);
    const w = canvas.width = canvas.clientWidth;
    const h = canvas.height = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    for(let i=1; i<4; i++) { const y = (h/4)*i; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.beginPath(); ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    cvNumbers.forEach((num, i) => {
        const x = (w / (cvNumbers.length - 1)) * i;
        const y = h - ((cvValues[num] || 0) / 255) * h;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    cvNumbers.forEach((num, i) => {
        const x = (w / (cvNumbers.length - 1)) * i;
        const y = h - ((cvValues[num] || 0) / 255) * h;
        ctx.fillStyle = '#38bdf8'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    });
}

function checkCondition(condNode) {
    const type = condNode.getAttribute('type');
    const op = condNode.getAttribute('operation') || 'equal';
    if (type === 'logical') {
        const children = Array.from(condNode.children).filter(c => c.tagName.includes('condition'));
        return op === 'and' ? children.every(c => checkCondition(c)) : children.some(c => checkCondition(c));
    }
    if (type === 'relational') {
        const cv = condNode.getAttribute('cv');
        const selection = condNode.getAttribute('selection');
        let val = cvValues[cv] || 0;
        if (selection && selection.startsWith('bit:')) val = (val & (1 << parseInt(selection.split(':')[1]))) !== 0 ? 1 : 0;
        const target = parseInt(condNode.getAttribute('value'));
        switch (op) {
            case 'equal': return val == target;
            case 'unEqual': return val != target;
            case 'greater': return val > target;
            case 'less': return val < target;
            case 'valid': return cvValues[cv] !== undefined;
            default: return false;
        }
    }
    if (type === 'decoderName') {
        const matches = condNode.getAttribute('value').split(';').some(name => decoderNameEl.textContent.includes(name));
        return op === 'equal' ? matches : !matches;
    }
    return false;
}

function scrollToCV(num) {
    const row = document.querySelector(`.cv-row[data-cv="${num}"]`);
    if (row) {
        const g = row.closest('.cv-group');
        if (g) g.classList.remove('collapsed');
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.style.boxShadow = '0 0 20px var(--accent-color)';
        setTimeout(() => row.style.boxShadow = 'none', 2000);
    }
}

function updateDependencies() {
    document.querySelectorAll('.cv-row[data-has-conditions="true"]').forEach(row => {
        const triggers = Array.from(row.conditions.getElementsByTagName('ct:trigger'));
        let disabled = false, reason = "", targetCv = null;
        triggers.forEach(tr => {
            const type = tr.getAttribute('value');
            const conds = Array.from(tr.children).filter(c => c.tagName.includes('condition'));
            if (conds.every(c => checkCondition(c)) && (type === 'notRelevant' || type === 'notInUse')) {
                disabled = true; targetCv = conds[0]?.getAttribute('cv');
                reason = targetCv ? `Inaktiv (CV ${targetCv})` : "Inaktiv";
            }
        });
        row.querySelector('.cv-dependency-hint')?.remove();
        if (disabled) {
            row.classList.add('is-disabled');
            const hint = document.createElement('div');
            hint.className = 'cv-dependency-hint';
            hint.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg><span>${reason}</span>${targetCv ? `<button class="btn-go-cv" onclick="scrollToCV(${targetCv})">Zu CV ${targetCv}</button>` : ''}`;
            row.querySelector('.cv-name').appendChild(hint);
        } else row.classList.remove('is-disabled');
    });
}

function showFileSelection() { fileSelectionScreen.style.display = 'block'; programmingScreen.style.display = 'none'; backBtn.style.display = 'none'; }
function showProgrammingScreen() { fileSelectionScreen.style.display = 'none'; programmingScreen.style.display = 'block'; backBtn.style.display = 'block'; }

init();
