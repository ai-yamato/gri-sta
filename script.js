document.addEventListener('DOMContentLoaded', () => {
    // --- Constants ---
    const STICKER_W = 370;
    const STICKER_H = 320;
    const MAIN_W = 240;
    const MAIN_H = 240;
    const TAB_W = 96;
    const TAB_H = 74;

    const VALID_COUNTS = [8, 16, 24, 32, 40];

    // --- Elements ---
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const selectBtn = document.getElementById('select-btn');
    const previewSection = document.getElementById('preview-section');
    const stickerGrid = document.getElementById('sticker-grid');
    const layoutInfo = document.getElementById('layout-info');
    const generateBtn = document.getElementById('generate-btn');
    const statusMsg = document.getElementById('status-message');
    const zipCheck = document.getElementById('zip-check');
    const previewMain = document.getElementById('preview-main');
    const previewTab = document.getElementById('preview-tab');

    // --- State ---
    let currentImage = null;
    let detectedLayout = null; // {rows, cols, count}
    let originalFile = null;

    // --- Events ---
    selectBtn.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    generateBtn.addEventListener('click', startGeneration);

    // --- Logic ---

    function handleFile(file) {
        if (!file.type.match('image.*')) {
            alert('画像ファイルを選択してください (PNG/JPG/WEBP)');
            return;
        }

        originalFile = file;

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                currentImage = img;
                detectAndPreview(img);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function detectAndPreview(img) {
        const w = img.width;
        const h = img.height;

        // Detect Layout
        const layout = detectLayout(w, h);

        if (!layout) {
            alert(`有効なレイアウトが見つかりませんでした。\n画像サイズ: ${w}x${h}\n8, 16, 24, 32, 40枚のいずれかに均等分割できるサイズにしてください。`);
            layoutInfo.textContent = "レイアウト検出不能";
            generateBtn.disabled = true;
            generateBtn.classList.remove('active');
            return;
        }

        detectedLayout = layout;
        layoutInfo.textContent = `検出: ${layout.rows}行 × ${layout.cols}列 = ${layout.count}枚`;

        // Render Preview
        renderPreview(img, layout);

        // Enable Generate
        generateBtn.disabled = false;
        statusMsg.textContent = "生成準備完了";
    }

    function detectLayout(width, height) {
        // Simple logic based on Python version
        const candidates = [];

        for (const count of VALID_COUNTS) {
            // Check factors
            for (let r = 1; r <= count; r++) {
                if (count % r === 0) {
                    const c = count / r;
                    // Check equal division
                    if (width % c === 0 && height % r === 0) {
                        const sw = width / c;
                        const sh = height / r;
                        const ratio = sw / sh;

                        // Target ratio is around 370/320 = 1.15
                        // Allow 0.8 to 1.4
                        if (ratio >= 0.8 && ratio <= 1.4) {
                            candidates.push({
                                rows: r,
                                cols: c,
                                count: count,
                                diff: Math.abs(ratio - (STICKER_W / STICKER_H))
                            });
                        }
                    }
                }
            }
        }

        if (candidates.length === 0) return null;

        // Sort by aspect ratio closeness
        candidates.sort((a, b) => a.diff - b.diff);
        return candidates[0];
    }

    function renderPreview(img, layout) {
        stickerGrid.innerHTML = '';
        previewSection.style.display = 'block';

        const sw = img.width / layout.cols;
        const sh = img.height / layout.rows;

        // Render Main Preview (First Sticker)
        const cMain = document.createElement('canvas');
        cMain.width = MAIN_W;
        cMain.height = MAIN_H;
        const ctxMain = cMain.getContext('2d');
        ctxMain.imageSmoothingEnabled = true;
        ctxMain.imageSmoothingQuality = "high";
        ctxMain.drawImage(img, 0, 0, sw, sh, 0, 0, MAIN_W, MAIN_H);
        previewMain.src = cMain.toDataURL('image/png');

        // Render Tab Preview (First Sticker)
        const cTab = document.createElement('canvas');
        cTab.width = TAB_W;
        cTab.height = TAB_H;
        const ctxTab = cTab.getContext('2d');
        ctxTab.imageSmoothingEnabled = true;
        ctxTab.imageSmoothingQuality = "high";
        ctxTab.drawImage(img, 0, 0, sw, sh, 0, 0, TAB_W, TAB_H);
        previewTab.src = cTab.toDataURL('image/png');

        // Use a temporary canvas to slice (Sticker Grid)
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = sw;
        canvas.height = sh;

        for (let r = 0; r < layout.rows; r++) {
            for (let c = 0; c < layout.cols; c++) {
                const idx = r * layout.cols + c + 1;

                // Clear and Draw slice
                ctx.clearRect(0, 0, sw, sh);
                ctx.drawImage(img, c * sw, r * sh, sw, sh, 0, 0, sw, sh);

                // Create thumbnail
                const thumbUrl = canvas.toDataURL('image/png');

                const item = document.createElement('div');
                item.className = 'sticker-item';

                const imgEl = document.createElement('img');
                imgEl.src = thumbUrl;

                const label = document.createElement('div');
                label.className = 'sticker-idx';
                label.textContent = String(idx).padStart(2, '0');

                item.appendChild(imgEl);
                item.appendChild(label);
                stickerGrid.appendChild(item);
            }
        }
    }

    async function startGeneration() {
        if (!currentImage || !detectedLayout) return;

        generateBtn.disabled = true;
        statusMsg.textContent = "生成中...";

        try {
            const zip = new JSZip();
            const { rows, cols, count } = detectedLayout;
            const sw = currentImage.width / cols;
            const sh = currentImage.height / rows;

            // Helper to get Blob from canvas part
            const getBlob = (x, y, w, h, targetW, targetH) => {
                return new Promise(resolve => {
                    const canvas = document.createElement('canvas');
                    canvas.width = targetW;
                    canvas.height = targetH;
                    const ctx = canvas.getContext('2d');

                    // High quality scaling
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = "high";

                    ctx.drawImage(currentImage, x, y, w, h, 0, 0, targetW, targetH);

                    canvas.toBlob(blob => {
                        resolve(blob);
                    }, 'image/png');
                });
            };

            // Process Stickers
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const idx = r * cols + c + 1;
                    const blob = await getBlob(c * sw, r * sh, sw, sh, STICKER_W, STICKER_H);
                    const filename = String(idx).padStart(2, '0') + '.png';
                    zip.file(filename, blob);
                }
            }

            // main.png (first sticker)
            const mainBlob = await getBlob(0, 0, sw, sh, MAIN_W, MAIN_H);
            zip.file('main.png', mainBlob);

            // tab.png (first sticker)
            const tabBlob = await getBlob(0, 0, sw, sh, TAB_W, TAB_H);
            zip.file('tab.png', tabBlob);

            // Generate ZIP
            const content = await zip.generateAsync({ type: "blob" });

            // Trigger Download
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            const baseName = originalFile.name.split('.')[0];
            a.href = url;
            a.download = `${baseName}_line_stickers.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            statusMsg.textContent = "生成完了！ダウンロードを開始しました";

        } catch (e) {
            console.error(e);
            alert("エラーが発生しました: " + e.message);
            statusMsg.textContent = "エラー発生";
        } finally {
            generateBtn.disabled = false;
        }
    }
});
