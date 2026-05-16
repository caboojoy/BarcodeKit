    /* ╔══════════════════════════════════════════════════════════════╗
    ║  script.js — BarcodeKit                                      ║
    ║  역할: 바코드 생성, 설정 관리, 다운로드(6종), 인쇄            ║
    ║  의존: JsBarcode 3.11.6, jsPDF 2.5.1, SheetJS 0.18.5       ║
    ╚══════════════════════════════════════════════════════════════╝ */

    'use strict';

    /* ═══════════════════════════════════════
        1. 전역 상태 (단일 진실 소스)
    ═══════════════════════════════════════ */
    const STATE = {
        type:      'CODE128',   // 현재 바코드 타입
        value:     '123456789012', // 입력값
        width:     2,           // 막대 너비 (JsBarcode width 옵션)
        height:    100,         // 바코드 높이 (px)
        margin:    10,          // 여백 (px)
        fgColor:   '#000000',   // 전경색 (바코드 막대)
        bgColor:   '#ffffff',   // 배경색
        showText:  true,        // 텍스트(숫자) 표시 여부
        isValid:   false,       // 현재 바코드 유효 여부
        isDark:    true,        // 다크 테마 여부
    };
    
    /* ═══════════════════════════════════════
        2. DOM 참조 캐시
    ═══════════════════════════════════════ */
    /** @param {string} id */
    const $ = id => document.getElementById(id);
    
    const DOM = {
        /* 바코드 출력 */
        svg:           $('barcodeSvg'),
        canvas:        $('barcodeCanvas'),
        previewArea:   $('previewArea'),
        placeholder:   $('previewPlaceholder'),
        typeBadge:     $('previewTypeBadge'),
        printArea:     $('printArea'),
    
        /* 입력 */
        valueInput:    $('barcodeValue'),
        inputClear:    $('inputClear'),
        inputHint:     $('inputHint'),
        inputError:    $('inputError'),
    
        /* 슬라이더 */
        widthSlider:   $('barcodeWidth'),
        widthVal:      $('barcodeWidthVal'),
        heightSlider:  $('barcodeHeight'),
        heightVal:     $('barcodeHeightVal'),
        marginSlider:  $('barcodeMargin'),
        marginVal:     $('barcodeMarginVal'),
    
        /* 색상 */
        fgColor:       $('fgColor'),
        fgHex:         $('fgHex'),
        bgColor:       $('bgColor'),
        bgHex:         $('bgHex'),
    
        /* 기타 설정 */
        showText:      $('showText'),
        themeToggle:   $('themeToggle'),
        themeIcon:     $('themeIcon'),
        toast:         $('toast'),
    
        /* 다운로드 버튼 */
        dlPng:         $('dlPng'),
        dlJpg:         $('dlJpg'),
        dlSvg:         $('dlSvg'),
        dlEps:         $('dlEps'),
        dlPdf:         $('dlPdf'),
        dlExcel:       $('dlExcel'),
        btnPrint:      $('btnPrint'),
    
        /* 타입 선택 버튼들 */
        typeBtns:      document.querySelectorAll('.type-btn'),
    };
    
    /* 다운로드 버튼 배열 (일괄 처리용) */
    const DL_BUTTONS = [
        DOM.dlPng, DOM.dlJpg, DOM.dlSvg,
        DOM.dlEps, DOM.dlPdf, DOM.dlExcel,
        DOM.btnPrint,
    ];
    
    /* ═══════════════════════════════════════
        3. 타입별 유효성 검증 규칙
    ═══════════════════════════════════════ */
    const RULES = {
        CODE128: {
        hint: 'CODE128 — 모든 ASCII 문자 허용 (제한 없음)',
        /** @param {string} v */
        validate: v => v.length > 0,
        error: '값을 입력해주세요.',
        },
        EAN13: {
        hint: 'EAN-13 — 숫자 12~13자리 (예: 880123456789)',
        validate: v => /^\d{12,13}$/.test(v),
        error: '숫자 12~13자리를 입력해주세요. (예: 880123456789)',
        },
        UPC: {
        hint: 'UPC-A — 숫자 11~12자리 (예: 01234567890)',
        validate: v => /^\d{11,12}$/.test(v),
        error: '숫자 11~12자리를 입력해주세요. (예: 01234567890)',
        },
        CODE39: {
        hint: 'CODE39 — 대문자 영문·숫자·특수문자(- . $ / + %) 허용',
        /*
            * Bug #7 수정: 정규식 문자 클래스 내에서 `%`는 이스케이프가 불필요합니다.
            * `\%`는 기술적으로 동작하나 명세상 올바르지 않으므로 `%`로 수정합니다.
            */
        validate: v => v.length > 0 && /^[A-Z0-9\-\.\$\/\+% ]+$/.test(v),
        error: '대문자·숫자·특수문자(- . $ / + %)만 허용됩니다. 소문자는 불가.',
        },
    };
    
    /* ═══════════════════════════════════════
        4. 유틸리티
    ═══════════════════════════════════════ */
    
    /**
        * 디바운스 — 빠른 입력 시 과도한 렌더링 방지
        * @param {Function} fn
        * @param {number} delay ms
        */
    function debounce(fn, delay) {
        let timer;
        return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
        };
    }
    
    /**
        * 파일 다운로드 헬퍼
        * @param {string|Blob} data  DataURL 또는 Blob
        * @param {string} filename
        * @param {string} [mime]     Blob일 때 MIME 타입
        */
    function triggerDownload(data, filename, mime) {
        const a = document.createElement('a');
    
        if (mime) {
        /*
            * Bug #4 수정:
            *   Blob URL을 변수에 저장하지 않으면 setTimeout 콜백에서
            *   `a.href`를 참조할 때 a 요소가 이미 DOM에서 제거된 상태라
            *   의도한 URL이 아닌 값이 revoke될 수 있습니다.
            *   → blobUrl 변수에 저장 후 revoke합니다.
            */
        const blob    = data instanceof Blob ? data : new Blob([data], { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        a.href = blobUrl;
        // 메모리 누수 방지: 60초 후 해제
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
        } else {
        // 이미 DataURL
        a.href = data;
        }
    
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
    
    /**
        * hex 색상 문자열 → { r, g, b } (0~1 범위)
        * @param {string} hex  '#rrggbb' 형식
        * @returns {{ r: number, g: number, b: number }}
        */
    function hexToRGB01(hex) {
        const clean = hex.replace('#', '');
        return {
        r: parseInt(clean.slice(0, 2), 16) / 255,
        g: parseInt(clean.slice(2, 4), 16) / 255,
        b: parseInt(clean.slice(4, 6), 16) / 255,
        };
    }
    
    /**
        * 날짜를 'YYYY-MM-DD HH:MM:SS' 형식으로 포맷
        * @returns {string}
        */
    function formatNow() {
        return new Date().toLocaleString('ko-KR', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
    }
    
    /* ═══════════════════════════════════════
        5. 바코드 생성 (핵심)
    ═══════════════════════════════════════ */
    
    /**
        * JsBarcode를 사용해 SVG에 바코드를 렌더링합니다.
        * 입력값 검증 → 렌더링 → UI 상태 갱신 순으로 진행.
        */
    function generateBarcode() {
        const raw   = DOM.valueInput.value;
        const value = raw.trim();
        const rule  = RULES[STATE.type];
    
        /* 힌트 업데이트 */
        DOM.inputHint.textContent = rule.hint;
    
        /* ── 빈 입력 처리 ── */
        if (!value) {
        clearPreview();
        setError('');
        setButtonsEnabled(false);
        return;
        }
    
        /* ── 유효성 검증 ── */
        if (!rule.validate(value)) {
        clearPreview();
        setError(rule.error);
        setButtonsEnabled(false);
        STATE.isValid = false;
        return;
        }
    
        /* ── 정상 처리 ── */
        setError('');
        STATE.value = value;
    
        /* SVG 페이드아웃 → 재생성 → 페이드인 */
        DOM.svg.classList.add('updating');
    
        /*
        * Bug #1 수정:
        *   JsBarcode의 `valid` 콜백 내에서 throw하면
        *   JsBarcode 내부 호출 스택에서 catch되어 외부 try-catch에
        *   전달이 보장되지 않습니다.
        *   → flag 변수로 유효성을 받은 뒤 외부에서 직접 throw합니다.
        */
        let barcodeValid = true;
    
        try {
        JsBarcode(DOM.svg, value, {
            format:       STATE.type,
            width:        STATE.width,
            height:       STATE.height,
            margin:       STATE.margin,
            lineColor:    STATE.fgColor,
            background:   STATE.bgColor,
            displayValue: STATE.showText,
            font:         'DM Mono, monospace',
            fontSize:     13,
            textMargin:   6,
            /* valid 콜백: 결과를 flag로 저장 (throw 금지) */
            valid: isValid => { barcodeValid = isValid; },
        });
    
        /* JsBarcode가 유효하지 않다고 판단한 경우 */
        if (!barcodeValid) {
            throw new Error('유효하지 않은 바코드 값입니다. 입력값을 확인해주세요.');
        }
    
        /* 성공 */
        DOM.placeholder.style.display = 'none';
        DOM.valueInput.classList.remove('error');
        DOM.typeBadge.textContent = STATE.type;
        STATE.isValid = true;
        setButtonsEnabled(true);
    
        } catch (err) {
        console.error('[BarcodeKit] 생성 오류:', err.message);
        clearPreview();
        setError(err.message || '바코드를 생성할 수 없습니다. 입력값을 확인해주세요.');
        setButtonsEnabled(false);
        STATE.isValid = false;
        } finally {
        /* 페이드인 */
        requestAnimationFrame(() => DOM.svg.classList.remove('updating'));
        }
    }
    
    /** 미리보기 초기화 (빈 상태로 복원) */
    function clearPreview() {
        DOM.svg.innerHTML = '';
        DOM.placeholder.style.display = 'flex';
    }
    
    /* ═══════════════════════════════════════
        6. SVG → Canvas 변환 (래스터 공통)
    ═══════════════════════════════════════ */
    
    /**
        * 현재 SVG를 고해상도 Canvas에 그립니다.
        * PNG·JPG·PDF 다운로드에서 공통으로 사용.
        *
        * @param {number} [scale=2]        출력 배율 (2 = 2x 고해상도)
        * @param {string|null} [bgForce]   null이면 STATE.bgColor 사용,
        *                                  문자열이면 강제 배경색 (JPG 흰색 강제 등)
        * @returns {Promise<HTMLCanvasElement>}
        */
    function svgToCanvas(scale = 2, bgForce = null) {
        return new Promise((resolve, reject) => {
        try {
            const svgEl = DOM.svg;
    
            /* SVG 크기 계산
            * Bug #3 수정: JsBarcode는 SVG에 width/height 속성을 직접 설정합니다.
            * getAttribute로 먼저 읽고, 없으면 viewBox → getBoundingClientRect 순으로 fallback.
            */
            const attrW   = parseFloat(svgEl.getAttribute('width')  || '0');
            const attrH   = parseFloat(svgEl.getAttribute('height') || '0');
            const svgRect = svgEl.getBoundingClientRect();
            const svgW    = attrW  || svgEl.viewBox?.baseVal?.width  || svgRect.width  || 300;
            const svgH    = attrH  || svgEl.viewBox?.baseVal?.height || svgRect.height || 150;
    
            /* SVG 문자열 직렬화 */
            const serializer = new XMLSerializer();
            let svgStr = serializer.serializeToString(svgEl);
    
            /* xmlns 속성 보장 */
            if (!svgStr.includes('xmlns=')) {
            svgStr = svgStr.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
            }
    
            /* Canvas 크기 설정 (고해상도 배율 적용) */
            const canvas = DOM.canvas;
            canvas.width  = Math.round(svgW * scale);
            canvas.height = Math.round(svgH * scale);
    
            const ctx = canvas.getContext('2d');
    
            /* 배경색 채우기 (투명 PNG도 배경 필요) */
            ctx.fillStyle = bgForce || STATE.bgColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
    
            /* SVG → Blob → ObjectURL → Image 렌더링 */
            const blob  = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
            const url   = URL.createObjectURL(blob);
            const img   = new Image();
    
            img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            resolve(canvas);
            };
    
            img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('SVG → Canvas 변환 실패'));
            };
    
            img.src = url;
    
        } catch (err) {
            reject(err);
        }
        });
    }
    
    /* ═══════════════════════════════════════
        7. 다운로드 함수들
    ═══════════════════════════════════════ */
    
    /* ── 7-1. PNG 다운로드 ── */
    async function downloadPNG() {
        if (!STATE.isValid) return;
        try {
        const canvas  = await svgToCanvas(2);
        const dataUrl = canvas.toDataURL('image/png');
        triggerDownload(dataUrl, `barcode_${STATE.value}.png`);
        showToast('✓ PNG 다운로드 완료 (2x 고해상도)', 'success');
        } catch (err) {
        console.error('[BarcodeKit] PNG 오류:', err);
        showToast('PNG 생성 실패: ' + err.message, 'error');
        }
    }
    
    /* ── 7-2. JPG 다운로드 ── */
    async function downloadJPG() {
        if (!STATE.isValid) return;
        try {
        /*
            * JPG는 알파채널(투명)을 지원하지 않으므로
            * 배경을 반드시 흰색(또는 지정 배경색)으로 채워야 합니다.
            * bgForce = '#ffffff' → 투명 영역을 흰색으로 대체
            */
        const canvas  = await svgToCanvas(2, '#ffffff');
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95); // 품질 95%
        triggerDownload(dataUrl, `barcode_${STATE.value}.jpg`);
        showToast('✓ JPG 다운로드 완료', 'success');
        } catch (err) {
        console.error('[BarcodeKit] JPG 오류:', err);
        showToast('JPG 생성 실패: ' + err.message, 'error');
        }
    }
    
    /* ── 7-3. SVG 다운로드 ── */
    function downloadSVG() {
        if (!STATE.isValid) return;
        try {
        const serializer = new XMLSerializer();
        let svgStr = serializer.serializeToString(DOM.svg);
    
        if (!svgStr.includes('xmlns=')) {
            svgStr = svgStr.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        }
    
        /* XML 선언 추가 (일부 뷰어 호환성) */
        const full = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgStr;
    
        triggerDownload(full, `barcode_${STATE.value}.svg`, 'image/svg+xml;charset=utf-8');
        showToast('✓ SVG 다운로드 완료 (벡터)', 'success');
        } catch (err) {
        console.error('[BarcodeKit] SVG 오류:', err);
        showToast('SVG 생성 실패: ' + err.message, 'error');
        }
    }
    
    /* ── 7-4. EPS 다운로드 (Adobe Illustrator용) ──────────────────────
        *
        * 변환 원리:
        *   JsBarcode가 출력한 SVG는 단순 <rect> 반복 구조입니다.
        *   이를 PostScript Level 2 `rectfill` 명령어로 1:1 변환합니다.
        *
        * 좌표계 차이:
        *   SVG  : 원점 = 좌상단, y 아래 방향↓
        *   EPS  : 원점 = 좌하단, y 위 방향↑
        *   변환 : eps_y = svgTotalHeight - svg_y - rect_height
        *
        * EPS 파일 구조:
        *   %!PS-Adobe-3.0 EPSF-3.0  ← EPS 헤더
        *   %%BoundingBox             ← Illustrator가 크기 인식에 사용
        *   setrgbcolor + rectfill    ← 배경 + 각 막대 렌더링
        *   텍스트 (선택)             ← Helvetica 폰트 사용
        *   %%EOF
        * ──────────────────────────────────────────────────────────────── */
    function downloadEPS() {
        if (!STATE.isValid) return;
        try {
        const svgEl = DOM.svg;
    
        /* SVG 전체 크기 */
        const svgW = parseFloat(svgEl.getAttribute('width'))
                    || svgEl.viewBox?.baseVal?.width
                    || svgEl.getBoundingClientRect().width
                    || 300;
        const svgH = parseFloat(svgEl.getAttribute('height'))
                    || svgEl.viewBox?.baseVal?.height
                    || svgEl.getBoundingClientRect().height
                    || 150;
    
        /* 색상 변환 */
        const fg = hexToRGB01(STATE.fgColor);
        const bg = hexToRGB01(STATE.bgColor);
    
        /* ── EPS 헤더 ── */
        const lines = [
            '%!PS-Adobe-3.0 EPSF-3.0',
            `%%BoundingBox: 0 0 ${Math.ceil(svgW)} ${Math.ceil(svgH)}`,
            `%%HiResBoundingBox: 0.000 0.000 ${svgW.toFixed(3)} ${svgH.toFixed(3)}`,
            /*
            * Bug #6 수정: EPS DSC 규격에서 %%Title, %%Creator 값은
            * PostScript 문자열이 아닌 일반 텍스트입니다.
            * 괄호( )는 PostScript 문자열 리터럴 구문이므로 DSC 주석에서 제거합니다.
            */
            '%%Title: BarcodeKit Generated Barcode',
            '%%Creator: BarcodeKit',
            `%%CreationDate: ${formatNow()}`,
            '%%DocumentData: Clean7Bit',
            '%%EndComments',
            '',
            '%%BeginProlog',
            '%%EndProlog',
            '',
            '%%Page: 1 1',
            '',
            '% ── 배경 채우기 ──',
            `${bg.r.toFixed(4)} ${bg.g.toFixed(4)} ${bg.b.toFixed(4)} setrgbcolor`,
            `0 0 ${svgW.toFixed(3)} ${svgH.toFixed(3)} rectfill`,
            '',
            '% ── 바코드 막대 ──',
            `${fg.r.toFixed(4)} ${fg.g.toFixed(4)} ${fg.b.toFixed(4)} setrgbcolor`,
        ];
    
        /* ── SVG <rect> 파싱 → PostScript ── */
        const rects = svgEl.querySelectorAll('rect');
    
        rects.forEach(rect => {
            const x = parseFloat(rect.getAttribute('x') || '0');
            const y = parseFloat(rect.getAttribute('y') || '0');
            const w = parseFloat(rect.getAttribute('width') || '0');
            const h = parseFloat(rect.getAttribute('height') || '0');
    
            if (w <= 0 || h <= 0) return;
    
            /* fill 색상 파악 (인라인 style 또는 속성) */
            const style     = rect.getAttribute('style') || '';
            const fillMatch = style.match(/fill:\s*([^;]+)/i);
            const fill      = fillMatch
            ? fillMatch[1].trim().toLowerCase()
            : (rect.getAttribute('fill') || '').toLowerCase();
    
            /* 배경색 rect이면 건너뜀 (이미 배경 처리 완료) */
            if (
            fill === 'none' ||
            fill === STATE.bgColor.toLowerCase() ||
            (w >= svgW * 0.9 && h >= svgH * 0.9) // 거의 전체 크기 = 배경 rect
            ) return;
    
            /*
            * EPS y 좌표 변환:
            *   SVG에서 y는 상단 기준(top),
            *   EPS에서 y는 하단 기준(bottom).
            *   eps_y = svgH - svg_y - rect_height
            */
            const epsY = svgH - y - h;
    
            lines.push(
            `${x.toFixed(3)} ${epsY.toFixed(3)} ${w.toFixed(3)} ${h.toFixed(3)} rectfill`
            );
        });
    
        /* ── 텍스트 변환 (displayValue=true일 때) ── */
        if (STATE.showText) {
            const textEls = svgEl.querySelectorAll('text');
    
            textEls.forEach(textEl => {
            const content  = textEl.textContent?.trim();
            if (!content) return;
    
            const tx       = parseFloat(textEl.getAttribute('x') || '0');
            const ty       = parseFloat(textEl.getAttribute('y') || '0');
            const fontSize = parseFloat(
                textEl.getAttribute('font-size') ||
                textEl.style?.fontSize ||
                '13'
            );
    
            /*
                * PostScript 텍스트 중앙 정렬:
                *   1. 문자열 너비를 stringwidth로 계산
                *   2. 절반만큼 왼쪽으로 이동(rmoveto)
                *   3. show로 출력
                *
                * EPS y: SVG의 baseline y를 EPS y로 변환
                *   EPS에서 텍스트 y = 좌하단 기준이므로 svgH - ty
                */
            const epsY = svgH - ty;
    
            // PostScript 특수문자 이스케이프 ( ) \
            const safe = content
                .replace(/\\/g, '\\\\')
                .replace(/\(/g, '\\(')
                .replace(/\)/g, '\\)');
    
            lines.push(
                '',
                '% ── 바코드 텍스트 ──',
                `${fg.r.toFixed(4)} ${fg.g.toFixed(4)} ${fg.b.toFixed(4)} setrgbcolor`,
                `/Helvetica findfont ${fontSize.toFixed(2)} scalefont setfont`,
                `${tx.toFixed(3)} ${epsY.toFixed(3)} moveto`,
                `(${safe}) dup stringwidth pop 2 div neg 0 rmoveto`,
                `(${safe}) show`,
            );
            });
        }
    
        lines.push('', '%%EOF', '');
    
        const epsContent = lines.join('\n');
        triggerDownload(epsContent, `barcode_${STATE.value}.eps`, 'application/postscript');
        showToast('✓ EPS 다운로드 완료 (Adobe Illustrator 호환)', 'success');
    
        } catch (err) {
        console.error('[BarcodeKit] EPS 오류:', err);
        showToast('EPS 생성 실패: ' + err.message, 'error');
        }
    }
    
    /* ── 7-5. PDF 다운로드 (jsPDF) ── */
    async function downloadPDF() {
        if (!STATE.isValid) return;
        if (typeof window.jspdf === 'undefined') {
        showToast('jsPDF 라이브러리 로딩 중... 잠시 후 다시 시도해주세요.', 'error');
        return;
        }
        try {
        /* Canvas 2x → DataURL */
        const canvas  = await svgToCanvas(2, '#ffffff');
        const imgData = canvas.toDataURL('image/png');
    
        /* 원본 크기 (px → pt, 1px = 0.75pt) */
        const imgW = canvas.width  / 2; // 2x 배율 제거
        const imgH = canvas.height / 2;
        const ptW  = imgW * 0.75;
        const ptH  = imgH * 0.75;
    
        const margin = 24; // pt
    
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: ptW >= ptH ? 'landscape' : 'portrait',
            unit:        'pt',
            format:      [ptW + margin * 2, ptH + margin * 2],
        });
    
        pdf.addImage(imgData, 'PNG', margin, margin, ptW, ptH);
        pdf.save(`barcode_${STATE.value}.pdf`);
        showToast('✓ PDF 다운로드 완료', 'success');
        } catch (err) {
        console.error('[BarcodeKit] PDF 오류:', err);
        showToast('PDF 생성 실패: ' + err.message, 'error');
        }
    }
    
    /* ── 7-6. Excel 다운로드 (SheetJS) ── */
    function downloadExcel() {
        if (!STATE.isValid) return;
        if (typeof XLSX === 'undefined') {
        showToast('SheetJS 라이브러리 로딩 중... 잠시 후 다시 시도해주세요.', 'error');
        return;
        }
        try {
        const wb = XLSX.utils.book_new();
    
        /* 데이터 행 구성 */
        const rows = [
            /* 헤더 */
            ['바코드 값', '타입', '막대 너비 (px)', '바코드 높이 (px)',
            '전경색', '배경색', '텍스트 표시', '생성일시'],
            /* 데이터 */
            [
            STATE.value,
            STATE.type,
            STATE.width,
            STATE.height,
            STATE.fgColor,
            STATE.bgColor,
            STATE.showText ? '표시' : '숨김',
            formatNow(),
            ],
        ];
    
        const ws = XLSX.utils.aoa_to_sheet(rows);
    
        /* 열 너비 자동 조정 */
        ws['!cols'] = [
            { wch: 20 }, { wch: 10 }, { wch: 16 }, { wch: 16 },
            { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 24 },
        ];
    
        /* 헤더 행 스타일 (굵게) — xlsx 무료판은 스타일 미지원, Pro만 가능 */
    
        XLSX.utils.book_append_sheet(wb, ws, '바코드 데이터');
        XLSX.writeFile(wb, `barcode_${STATE.value}.xlsx`);
        showToast('✓ Excel 다운로드 완료 (.xlsx)', 'success');
        } catch (err) {
        console.error('[BarcodeKit] Excel 오류:', err);
        showToast('Excel 생성 실패: ' + err.message, 'error');
        }
    }
    
    /* ── 7-7. 인쇄 ── */
    function printBarcode() {
        if (!STATE.isValid) return;
        try {
        /* 인쇄 전용 영역에 SVG 복사 */
        const serializer = new XMLSerializer();
        DOM.printArea.innerHTML = serializer.serializeToString(DOM.svg);
    
        /*
            * Bug #2 수정:
            *   `window.print()` 직후 `innerHTML = ''`을 실행하면
            *   일부 브라우저에서 인쇄 대화상자가 열리기 전에 SVG가 사라집니다.
            *   → `onafterprint` 이벤트에서 초기화합니다.
            *   one-time 핸들러로 등록하여 중복 실행을 방지합니다.
            */
        const cleanup = () => {
            DOM.printArea.innerHTML = '';
            window.removeEventListener('afterprint', cleanup);
        };
        window.addEventListener('afterprint', cleanup);
    
        window.print();
        } catch (err) {
        console.error('[BarcodeKit] 인쇄 오류:', err);
        DOM.printArea.innerHTML = ''; // 오류 시 즉시 초기화
        showToast('인쇄 중 오류가 발생했습니다.', 'error');
        }
    }
    
    /* ═══════════════════════════════════════
        8. UI 상태 관리
    ═══════════════════════════════════════ */
    
    /**
        * 오류 메시지 표시/숨김
        * @param {string} msg  빈 문자열이면 초기화
        */
    function setError(msg) {
        if (msg) {
        DOM.inputError.textContent = msg;
        DOM.inputError.classList.add('visible');
        DOM.valueInput.classList.add('error');
        } else {
        DOM.inputError.textContent = '';
        DOM.inputError.classList.remove('visible');
        DOM.valueInput.classList.remove('error');
        }
    }
    
    /**
        * 다운로드 버튼 활성/비활성
        * @param {boolean} enabled
        */
    function setButtonsEnabled(enabled) {
        DL_BUTTONS.forEach(btn => {
        btn.disabled = !enabled;
        });
    }
    
    /* ═══════════════════════════════════════
        9. 토스트 알림
    ═══════════════════════════════════════ */
    let _toastTimer;
    
    /**
        * @param {string} msg
        * @param {'success'|'error'|''} [type]
        * @param {number} [duration=2800] ms
        */
    function showToast(msg, type = '', duration = 2800) {
        clearTimeout(_toastTimer);
        DOM.toast.textContent = msg;
        DOM.toast.className   = `toast visible ${type}`;
        _toastTimer = setTimeout(() => {
        DOM.toast.classList.remove('visible');
        }, duration);
    }
    
    /* ═══════════════════════════════════════
        10. 테마 관리
    ═══════════════════════════════════════ */
    
    /** 초기 테마 결정 — localStorage > OS 설정 순 */
    function initTheme() {
        const saved = localStorage.getItem('barcodekit-theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const isDark = saved ? saved === 'dark' : prefersDark;
        applyTheme(isDark, false); // 저장 없이 적용
    }
    
    /**
        * 테마 적용
        * @param {boolean} dark
        * @param {boolean} [save=true]
        */
    function applyTheme(dark, save = true) {
        STATE.isDark = dark;
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
        DOM.themeIcon.textContent = dark ? '☀️' : '🌙';
        if (save) localStorage.setItem('barcodekit-theme', dark ? 'dark' : 'light');
    }
    
    /* ═══════════════════════════════════════
        11. 이벤트 바인딩
    ═══════════════════════════════════════ */
    function bindEvents() {
    
        /* ── 바코드 타입 선택 ── */
        DOM.typeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            /* aria-pressed 토글 */
            DOM.typeBtns.forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-pressed', 'false');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-pressed', 'true');
    
            STATE.type = btn.dataset.type;
            debouncedGenerate();
        });
        });
    
        /* ── 텍스트 입력 (디바운스 300ms) ── */
        DOM.valueInput.addEventListener('input', debouncedGenerate);
    
        /* ── 입력 지우기 버튼 ── */
        DOM.inputClear.addEventListener('click', () => {
        DOM.valueInput.value = '';
        DOM.valueInput.focus();
        debouncedGenerate();
        });
    
        /* ── Enter 키 즉시 생성 ── */
        DOM.valueInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            generateBarcode();
        }
        });
    
        /* ── 슬라이더: 막대 너비 ── */
        DOM.widthSlider.addEventListener('input', () => {
        STATE.width = parseFloat(DOM.widthSlider.value);
        DOM.widthVal.textContent = STATE.width + 'px';
        DOM.widthSlider.setAttribute('aria-valuenow', STATE.width);
        debouncedGenerate();
        });
    
        /* ── 슬라이더: 바코드 높이 ── */
        DOM.heightSlider.addEventListener('input', () => {
        STATE.height = parseInt(DOM.heightSlider.value);
        DOM.heightVal.textContent = STATE.height + 'px';
        DOM.heightSlider.setAttribute('aria-valuenow', STATE.height);
        debouncedGenerate();
        });
    
        /* ── 슬라이더: 여백 ── */
        DOM.marginSlider.addEventListener('input', () => {
        STATE.margin = parseInt(DOM.marginSlider.value);
        DOM.marginVal.textContent = STATE.margin + 'px';
        DOM.marginSlider.setAttribute('aria-valuenow', STATE.margin);
        debouncedGenerate();
        });
    
        /* ── 색상: 전경 ── */
        DOM.fgColor.addEventListener('input', () => {
        STATE.fgColor = DOM.fgColor.value;
        DOM.fgHex.textContent = STATE.fgColor;
        debouncedGenerate();
        });
    
        /* ── 색상: 배경 ── */
        DOM.bgColor.addEventListener('input', () => {
        STATE.bgColor = DOM.bgColor.value;
        DOM.bgHex.textContent = STATE.bgColor;
        debouncedGenerate();
        });
    
        /* ── 텍스트 표시 토글 ── */
        DOM.showText.addEventListener('change', () => {
        STATE.showText = DOM.showText.checked;
        DOM.showText.setAttribute('aria-checked', String(STATE.showText));
        debouncedGenerate();
        });
    
        /* ── 다크모드 수동 토글 ── */
        DOM.themeToggle.addEventListener('click', () => applyTheme(!STATE.isDark));
    
        /* ── OS 다크모드 변경 자동 감지 ── */
        window.matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', e => {
            // 사용자가 수동 설정한 경우 OS 변경 무시
            if (!localStorage.getItem('barcodekit-theme')) {
            applyTheme(e.matches, false);
            }
        });
    
        /* ── 다운로드 버튼 ── */
        DOM.dlPng.addEventListener('click',   downloadPNG);
        DOM.dlJpg.addEventListener('click',   downloadJPG);
        DOM.dlSvg.addEventListener('click',   downloadSVG);
        DOM.dlEps.addEventListener('click',   downloadEPS);
        DOM.dlPdf.addEventListener('click',   downloadPDF);
        DOM.dlExcel.addEventListener('click', downloadExcel);
        DOM.btnPrint.addEventListener('click', printBarcode);
    }
    
    /* ═══════════════════════════════════════
        12. 디바운스된 생성 함수
    ═══════════════════════════════════════ */
    /** 300ms 디바운스 — 빠른 타이핑 중 과도한 렌더링 방지 */
    const debouncedGenerate = debounce(generateBarcode, 300);
    
    /* ═══════════════════════════════════════
        13. 초기화
    ═══════════════════════════════════════ */
    function init() {
        /* 테마 적용 (DOMContentLoaded 이후 첫 실행) */
        initTheme();
    
        /* 이벤트 연결 */
        bindEvents();
    
        /* 버튼 초기 비활성 (바코드 미생성 상태) */
        setButtonsEnabled(false);
    
        /* 기본값(123456789012)으로 첫 바코드 생성 */
        generateBarcode();
    }
    
    /* DOM 완전 로드 후 실행 */
    document.addEventListener('DOMContentLoaded', init);

    