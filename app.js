const app = {
    state: {
        apiKey: localStorage.getItem('processAI_apiKey') || '',
        processes: JSON.parse(localStorage.getItem('processAI_processes')) || [],
        currentProcess: null,
        areaChartInstance: null,
        mediaRecorder: null,
        audioChunks: [],
        recordedBlob: null,
        recordingInterval: null,
        recordingTime: 0
    },

    init() {
        // Initial setup
        this.renderInventory();
        this.updateDashboard();
        
        // Listeners
        document.getElementById('processForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleGenerate();
        });

        // Prompt API key if none
        if (!this.state.apiKey) {
            setTimeout(() => this.openApiModal(), 500);
        }
    },

    async toggleRecording() {
        if (this.state.mediaRecorder && this.state.mediaRecorder.state === 'recording') {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    },

    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.state.mediaRecorder = new MediaRecorder(stream);
            this.state.audioChunks = [];

            this.state.mediaRecorder.ondataavailable = event => {
                if (event.data.size > 0) {
                    this.state.audioChunks.push(event.data);
                }
            };

            this.state.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.state.audioChunks, { type: 'audio/webm' });
                this.state.recordedBlob = audioBlob;
                
                const audioUrl = URL.createObjectURL(audioBlob);
                const playback = document.getElementById('audioPlayback');
                playback.src = audioUrl;
                
                document.getElementById('recordingStatus').classList.add('hidden');
                document.getElementById('recordedAudioContainer').classList.remove('hidden');
                
                document.getElementById('procFile').value = '';
                
                stream.getTracks().forEach(track => track.stop());
            };

            this.state.mediaRecorder.start();

            // UI Changes
            const btn = document.getElementById('btnRecordAudio');
            btn.innerHTML = '<i class="fa-solid fa-stop"></i> Detener Grabación';
            btn.style.background = 'linear-gradient(135deg, #475569, #334155)';

            document.getElementById('recordingStatus').classList.remove('hidden');
            document.getElementById('recordedAudioContainer').classList.add('hidden');
            
            this.state.recordingTime = 0;
            this.state.recordingInterval = setInterval(() => {
                this.state.recordingTime++;
                const mins = String(Math.floor(this.state.recordingTime / 60)).padStart(2, '0');
                const secs = String(this.state.recordingTime % 60).padStart(2, '0');
                document.getElementById('recordingTime').innerText = `${mins}:${secs}`;
            }, 1000);

        } catch (err) {
            alert('No se pudo acceder al micrófono. Por favor permite el acceso en tu navegador.');
            console.error(err);
        }
    },

    stopRecording() {
        if (this.state.mediaRecorder && this.state.mediaRecorder.state === 'recording') {
            this.state.mediaRecorder.stop();
            clearInterval(this.state.recordingInterval);
            
            const btn = document.getElementById('btnRecordAudio');
            btn.innerHTML = '<i class="fa-solid fa-microphone"></i> Regrabar Audio';
            btn.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
        }
    },

    clearRecording() {
        this.state.recordedBlob = null;
        this.state.audioChunks = [];
        document.getElementById('recordedAudioContainer').classList.add('hidden');
        
        const btn = document.getElementById('btnRecordAudio');
        btn.innerHTML = '<i class="fa-solid fa-microphone"></i> Grabar Audio';
        btn.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
    },
    
    handleFileSelect() {
        if(document.getElementById('procFile').files.length > 0) {
            this.clearRecording();
        }
    },

    navigate(viewId) {
        // Hide all views
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
        });
        
        // Show target view
        document.getElementById(`view-${viewId}`).classList.add('active');

        // Toggle Nav Bar
        const nav = document.getElementById('mainNav');
        if (viewId === 'splash') {
            nav.classList.add('hidden');
        } else {
            nav.classList.remove('hidden');
        }

        if(viewId === 'dashboard') {
            this.renderInventory();
            this.updateDashboard();
        }
        
        window.scrollTo(0, 0);
    },

    openApiModal() {
        document.getElementById('apiKey').value = this.state.apiKey;
        document.getElementById('apiModal').classList.add('active');
    },

    closeApiModal() {
        document.getElementById('apiModal').classList.remove('active');
    },

    saveApiKey() {
        const key = document.getElementById('apiKey').value.trim();
        if (key) {
            this.state.apiKey = key;
            localStorage.setItem('processAI_apiKey', key);
            this.closeApiModal();
        } else {
            alert('Por favor ingresa una API Key válida.');
        }
    },

    readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64String = reader.result.split(',')[1];
                let mimeType = file.type;
                if (!mimeType) {
                    if (file.name.endsWith('.pdf')) mimeType = 'application/pdf';
                    else if (file.name.endsWith('.txt')) mimeType = 'text/plain';
                    else if (file.name.endsWith('.mp3')) mimeType = 'audio/mpeg';
                    else if (file.name.endsWith('.wav')) mimeType = 'audio/wav';
                    else if (file.name.endsWith('.ogg')) mimeType = 'audio/ogg';
                    else mimeType = 'application/octet-stream';
                }
                resolve({ mimeType, data: base64String });
            };
            reader.onerror = error => reject(error);
            reader.readAsDataURL(file);
        });
    },

    async handleGenerate() {
        if (!this.state.apiKey) {
            this.openApiModal();
            return;
        }

        const btn = document.getElementById('btnMagicAI');
        const loader = document.getElementById('aiLoader');
        const output = document.getElementById('outputContent');
        const saveBtn = document.getElementById('btnSaveProcess');
        const pdfBtn = document.getElementById('btnExportPdf');
        const jsonBtn = document.getElementById('btnExportJson');

        // Collect form data
        const formData = {
            name: document.getElementById('procName').value,
            area: document.getElementById('procArea').value,
            history: document.getElementById('procHistory').value,
            clients: document.getElementById('procClients').value,
            tools: document.getElementById('procTools').value,
            fileInput: document.getElementById('procFile').files[0]
        };

        if (!formData.history.trim() && !formData.fileInput && !this.state.recordedBlob) {
            alert('Por favor, escribe el relato, graba un audio o adjunta un archivo.');
            return;
        }

        // UI State: Loading
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Preparando...';
        output.innerHTML = '';
        output.appendChild(loader);
        loader.classList.remove('hidden');
        
        saveBtn.classList.add('hidden');
        pdfBtn.classList.add('hidden');
        jsonBtn.classList.add('hidden');

        try {
            let fileData = null;
            if (this.state.recordedBlob) {
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Preparando audio grabado...';
                fileData = await this.readFileAsBase64(this.state.recordedBlob);
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analizando voz con IA...';
            } else if (formData.fileInput) {
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Leyendo archivo...';
                fileData = await this.readFileAsBase64(formData.fileInput);
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analizando con IA...';
            } else {
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analizando texto con IA...';
            }

            const result = await this.callGeminiAPI(formData, fileData);
            
            // Generate ID and Date
            this.state.currentProcess = {
                id: 'PROC-' + Date.now().toString().slice(-6),
                date: new Date().toLocaleDateString(),
                formData: formData,
                ficha: result
            };

            this.renderFicha(this.state.currentProcess);

            // Auto-guardado transparente para que esté disponible en el Dashboard al instante
            this.saveCurrentProcess(true);

            saveBtn.classList.remove('hidden');
            pdfBtn.classList.remove('hidden');
            jsonBtn.classList.remove('hidden');

        } catch (error) {
            console.error(error);
            output.innerHTML = `<div class="doc-insights"><p style="color:red"><i class="fa-solid fa-triangle-exclamation"></i> Error: ${error.message}</p></div>`;
        } finally {
            // UI State: Reset
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Magia IA (Generar Arquitectura)';
            loader.classList.add('hidden');
        }
    },

    async callGeminiAPI(data, fileData) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.state.apiKey}`;
        
        let promptText = `Eres un Arquitecto Empresarial Experto en documentación de procesos 4.0.
Transforma la información aportada sobre el proceso en una Ficha Técnica estandarizada. 
Usa verbos en infinitivo para las acciones. 

Datos proporcionados:
- Nombre: ${data.name}
- Área: ${data.area}`;

        if (data.history.trim()) {
            promptText += `\n- Relato informal escrito: "${data.history}"`;
        }
        if (data.clients) promptText += `\n- Clientes/Involucrados: ${data.clients}`;
        if (data.tools) promptText += `\n- Herramientas: ${data.tools}`;

        if (fileData) {
            promptText += `\n\nIMPORTANTE: Se ha adjuntado un documento o archivo de audio al prompt. Por favor, extrae los pasos del proceso, los involucrados y las herramientas detalladamente desde ese archivo adjunto. Integra coherentemente la información del texto y del archivo para construir la Ficha Técnica final.`;
        }

        promptText += `\n\nREGLA ESTRICTA: Devuelve la respuesta ÚNICAMENTE en formato JSON válido, sin delimitadores de código markdown (\`\`\`json), solo el objeto JSON, con la siguiente estructura exacta:
{
  "objetivo_principal": "string (Objetivo redactado profesionalmente)",
  "pasos": [
    { "accion": "string (Verbo infinitivo + acción concreta)", "responsable": "string", "herramienta": "string" }
  ],
  "entradas": ["string (Insumos necesarios)"],
  "salidas": ["string (Entregables finales)"],
  "insights": ["string (Recomendación 1 para mejorar la eficiencia del proceso)", "string (Recomendación 2)"]
}`;

        const parts = [{ text: promptText }];
        
        if (fileData) {
            parts.push({
                inlineData: {
                    mimeType: fileData.mimeType,
                    data: fileData.data
                }
            });
        }

        const requestBody = {
            contents: [{ parts: parts }],
            generationConfig: {
                temperature: 0.3
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'Error comunicándose con la IA.');
        }

        const jsonResponse = await response.json();
        let apiText = jsonResponse.candidates[0].content.parts[0].text;
        
        // Clean markdown backticks if Gemini ignores the prompt instruction
        apiText = apiText.replace(/^```json/g, '').replace(/^```/g, '').replace(/```$/g, '').trim();

        try {
            return JSON.parse(apiText);
        } catch(e) {
            console.error("Error parsing JSON target. Raw text:", apiText);
            throw new Error("El modelo generó un formato inválido. Inténtalo de nuevo.");
        }
    },

    renderFicha(processData) {
        const { id, formData, ficha } = processData;
        const output = document.getElementById('outputContent');
        
        // Check if data is valid
        if(!ficha || !ficha.pasos) {
             output.innerHTML = `<div class="empty-state"><p>Error renderizando datos. Formato IA no esperado.</p></div>`;
             return;
        }

        let pasosHTML = '';
        ficha.pasos.forEach((p, idx) => {
            pasosHTML += `
                <li>
                    <div class="step-num">${idx + 1}</div>
                    <div>
                        <strong>${p.accion}</strong><br>
                        <small><em>Responsable:</em> ${p.responsable} | <em>Apoyo:</em> ${p.herramienta}</small>
                    </div>
                </li>
            `;
        });

        let entradasHTML = ficha.entradas.map(e => `<li><i class="fa-solid fa-arrow-right-to-bracket" style="color:#64748b"></i> ${e}</li>`).join('');
        let salidasHTML = ficha.salidas.map(s => `<li><i class="fa-solid fa-arrow-right-from-bracket" style="color:#06d0c6"></i> ${s}</li>`).join('');
        let insightsHTML = ficha.insights.map(i => `<li><i class="fa-solid fa-lightbulb" style="color:#eab308"></i> ${i}</li>`).join('');

        const html = `
            <div class="doc-ficha">
                <h2>${formData.name}</h2>
                <div class="doc-meta">
                    <p><strong>ID Proceso:</strong> ${id}</p>
                    <p><strong>Área:</strong> ${formData.area}</p>
                    <p><strong>Fecha Generación:</strong> ${processData.date}</p>
                    <p><strong>Clientes/Actores:</strong> ${formData.clients || 'N/A'}</p>
                </div>
                
                <div class="doc-section">
                    <h4><i class="fa-solid fa-bullseye"></i> Objetivo Principal</h4>
                    <p>${ficha.objetivo_principal}</p>
                </div>

                <div class="form-row">
                    <div class="doc-section half">
                        <h4>Entradas</h4>
                        <ul class="doc-list">${entradasHTML}</ul>
                    </div>
                    <div class="doc-section half">
                        <h4>Salidas</h4>
                        <ul class="doc-list">${salidasHTML}</ul>
                    </div>
                </div>

                <div class="doc-section">
                    <h4><i class="fa-solid fa-list-ol"></i> Secuencia de Actividades</h4>
                    <ul class="doc-list">${pasosHTML}</ul>
                </div>

                <div class="doc-section doc-insights">
                    <h4><i class="fa-solid fa-rocket"></i> Insights & Mejora Continua (IA)</h4>
                    <ul class="doc-list" style="background:transparent; border:none; padding-left:1rem; margin-top:0.5rem">${insightsHTML}</ul>
                </div>
            </div>
        `;

        output.innerHTML = html;
        
        // Prepare PDF template data
        document.getElementById('pdfTemplate').innerHTML = html; 
    },

    saveCurrentProcess(silent = false) {
        if (!this.state.currentProcess) return;
        
        // Update if exists, else trigger add
        const index = this.state.processes.findIndex(p => p.id === this.state.currentProcess.id);
        if (index > -1) {
            this.state.processes[index] = this.state.currentProcess;
        } else {
            this.state.processes.push(this.state.currentProcess);
        }

        localStorage.setItem('processAI_processes', JSON.stringify(this.state.processes));
        
        if(!silent) {
            alert('Proceso manual actualizado/guardado exitosamente en el Inventario.');
        }
    },

    deleteProcess(id) {
        if(confirm("¿Estás seguro de eliminar este proceso?")) {
            this.state.processes = this.state.processes.filter(p => p.id !== id);
            localStorage.setItem('processAI_processes', JSON.stringify(this.state.processes));
            this.renderInventory();
            this.updateDashboard();
        }
    },

    renderInventory() {
        const tbody = document.getElementById('inventoryTableBody');
        if(!tbody) return;
        
        tbody.innerHTML = '';
        
        if(this.state.processes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color: #64748b">No hay procesos documentados aún.</td></tr>';
            return;
        }

        this.state.processes.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${p.id}</strong><br><small>${p.date}</small></td>
                <td>${p.formData.name}</td>
                <td><span style="background: rgba(17, 107, 207, 0.1); color: var(--action); padding: 4px 8px; border-radius: 4px; font-size:0.85rem">${p.formData.area}</span></td>
                <td><small>${p.ficha.objetivo_principal.substring(0, 60)}...</small></td>
                <td>
                    <button class="icon-btn" style="width:30px; height:30px; font-size:1rem" onclick="app.loadProcess('${p.id}')" title="Ver/Cargar"><i class="fa-solid fa-eye"></i></button>
                    <button class="icon-btn" style="width:30px; height:30px; font-size:1rem; color: #ef4444" onclick="app.deleteProcess('${p.id}')" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    loadProcess(id) {
        const proc = this.state.processes.find(p => p.id === id);
        if(proc) {
            this.state.currentProcess = proc;
            
            // Populate form
            document.getElementById('procName').value = proc.formData.name;
            document.getElementById('procArea').value = proc.formData.area;
            document.getElementById('procHistory').value = proc.formData.history;
            document.getElementById('procClients').value = proc.formData.clients;
            document.getElementById('procTools').value = proc.formData.tools;
            
            this.renderFicha(proc);
            
            // Show buttons
            document.getElementById('btnSaveProcess').classList.remove('hidden');
            document.getElementById('btnExportPdf').classList.remove('hidden');
            document.getElementById('btnExportJson').classList.remove('hidden');

            this.navigate('editor');
        }
    },

    updateDashboard() {
        if(!document.getElementById('kpiTotal')) return;

        const total = this.state.processes.length;
        
        // Count distinct areas
        const areas = new Set(this.state.processes.map(p => p.formData.area));
        
        // Avg steps
        let totalSteps = 0;
        this.state.processes.forEach(p => {
            if(p.ficha && p.ficha.pasos) totalSteps += p.ficha.pasos.length;
        });
        const avgSteps = total > 0 ? (totalSteps / total).toFixed(1) : 0;

        document.getElementById('kpiTotal').innerText = total;
        document.getElementById('kpiAreas').innerText = areas.size;
        document.getElementById('kpiAvgSteps').innerText = avgSteps;

        // Chart Data Extraction
        const areaCounts = {};
        this.state.processes.forEach(p => {
            areaCounts[p.formData.area] = (areaCounts[p.formData.area] || 0) + 1;
        });

        const ctx = document.getElementById('areaChart');
        if(!ctx) return;

        if(this.state.areaChartInstance) {
            this.state.areaChartInstance.destroy();
        }

        if(total > 0) {
            this.state.areaChartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(areaCounts),
                    datasets: [{
                        label: 'Procesos',
                        data: Object.values(areaCounts),
                        backgroundColor: [
                            '#304c69', '#116bcf', '#06d0c6', '#8b5cf6', '#ec4899'
                        ],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right' }
                    }
                }
            });
        }
    },

    exportJson() {
        if(!this.state.currentProcess) return;
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.state.currentProcess, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href",     dataStr);
        downloadAnchorNode.setAttribute("download", `Proceso_${this.state.currentProcess.id}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    },

    exportPdf() {
        if (!this.state.currentProcess) return;

        const element = document.querySelector('#outputContent .doc-ficha');
        if (!element) {
            alert("No hay ficha para exportar.");
            return;
        }

        const btn = document.getElementById('btnExportPdf');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generando PDF...';
        btn.disabled = true;

        const logoImg = new Image();
        logoImg.crossOrigin = "Anonymous";
        logoImg.src = "data:image/png;base64,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";
        logoImg.style.height = "60px";
        logoImg.style.maxWidth = "100%";
        
        const executePdf = () => {
            const header = document.createElement('div');
            header.style.textAlign = 'center';
            header.style.marginBottom = '30px';
            header.appendChild(logoImg);

            const footer = document.createElement('div');
            footer.style.marginTop = '40px';
            footer.style.paddingTop = '20px';
            footer.style.borderTop = '2px solid #e2e8f0';
            footer.style.textAlign = 'center';
            footer.style.fontSize = '0.85rem';
            footer.style.color = '#64748b';
            footer.style.lineHeight = '1.6';
            footer.innerHTML = `
                <strong>Web:</strong> www.jmaiconsulting.pe &nbsp;|&nbsp;
                <strong>Teléfono:</strong> +51 914 811 842 &nbsp;|&nbsp;
                <strong>Correo:</strong> contacto@jmaiconsulting.pe
            `;

            element.insertBefore(header, element.firstChild);
            element.appendChild(footer);

            const opt = {
                margin:       [0.5, 0.5, 0.5, 0.5],
                filename:     `Ficha_${this.state.currentProcess.id}.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
                jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' },
                pagebreak:    { mode: 'css', avoid: ['.doc-section', '.doc-meta', 'li', 'h2', 'h3', 'h4'] }
            };

            html2pdf().set(opt).from(element).save().then(() => {
                header.remove();
                footer.remove();
                btn.innerHTML = originalText;
                btn.disabled = false;
            });
        };

        if (logoImg.complete) {
            executePdf();
        } else {
            logoImg.onload = executePdf;
            logoImg.onerror = () => {
                logoImg.style.display = 'none';
                executePdf();
            };
        }
    }
};

window.onload = () => {
    app.init();
};
