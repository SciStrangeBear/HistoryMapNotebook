// 全局变量
let map;
let pins = [];
let currentPin = null;
let currentLatLng = null;
let currentTool = 'select'; // 'select' 或 'pin'
let pinStyle = {
    color: 'auto',
    style: 'circle'
};
let currentLayer = 'basic';
let mapLayers = {};
let availableTags = ['政治', '军事', '经济', '文化', '古代', '近代', '现代'];
let allMarkers = []; // 存储所有标记用于过滤
let isEditMode = false; // 编辑模式标志
let currentEditingPin = null; // 正在编辑的图钉ID

// 图钉工具-坐标悬浮提示相关状态
let pinHoverTooltipEl = null;            // 浮动提示元素
let pinHoverIntervalId = null;           // 100ms 刷新定时器ID
let pinLastMousePos = { x: 0, y: 0 };    // 最近一次鼠标位置（页面坐标）
let pinLastLatLng = null;                // 最近一次鼠标对应的地图坐标
let pinMouseMoveHandler = null;          // 鼠标移动事件处理器引用，便于移除
let pinEscKeyHandler = null;             // ESC 键处理器引用，便于移除
let openNotes = []; // 当前打开的笔记弹窗状态列表
// 城市显示功能相关变量与常量已移除

// 初始化地图
function initMap() {
    // 创建地图实例，中心设置为中国，允许多个弹窗同时存在
    map = L.map('map', { closePopupOnClick: false }).setView([35.8617, 104.1954], 4);
    
    // 定义多个地图图层
    mapLayers = {
        basic: L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
        attribution: '© 高德地图',
        subdomains: ['1', '2', '3', '4'],
        maxZoom: 18
    }),
    satellite: L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}', {
        attribution: '© 高德地图',
        subdomains: ['1', '2', '3', '4'],
        maxZoom: 18
    }),
        openstreet: L.tileLayer('https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        subdomains: ['a', 'b', 'c'],
        maxZoom: 19
    }),
        google: L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
            attribution: '© Google Maps',
            subdomains: ['0', '1', '2', '3'],
            maxZoom: 20
        }),
        google_satellite: L.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
            attribution: '© Google Maps Satellite',
            subdomains: ['0', '1', '2', '3'],
            maxZoom: 20
        })
    };
    
    // 添加默认图层
    mapLayers[currentLayer].addTo(map);

    // 城市名称图层已移除
    
    // 地图点击事件
    map.on('click', function(e) {
        if (currentTool === 'pin') {
            currentLatLng = e.latlng;
            showPinModal();
        }
    });

    // 城市名称懒加载事件已移除
    
    // 监听弹窗打开/关闭以维护状态
map.on('popupopen', function(e) {
        const popup = e.popup;
        const source = popup._source; // 关联的marker
        if (!source) return;
        const id = source._leaflet_id;
        const exists = openNotes.find(n => n.id === id);
        const now = Date.now();
        if (!exists) {
            openNotes.push({ id, popup, openedAt: now });
        } else {
            exists.openedAt = now;
        }

        // 简单自动布局：为当前弹窗设置偏移以减少重叠
        const idx = openNotes.findIndex(n => n.id === id);
        const offsets = [L.point(20, -20), L.point(20, 20), L.point(-20, -20), L.point(-20, 20), L.point(30, 0)];
        const chosenOffset = offsets[idx % offsets.length];
        popup.options.offset = chosenOffset;
        popup.update();

        // 绑定展开/收起按钮与懒加载正文
        const root = popup._contentNode; // 弹窗内容根节点
        if (root) {
            const expandBtn = root.querySelector('.btn-expand');
            const collapseBtn = root.querySelector('.btn-collapse');
            const detailsEl = root.querySelector('.popup-details');
            const markerId = source._leaflet_id;
            const pin = pins[markerId];
            if (expandBtn && collapseBtn && detailsEl && pin) {
                const loadBodyHtml = () => {
                    if (detailsEl.dataset.loaded === 'true') return;
                    const md = pin.data.body || pin.data.notes || '';
                    try {
                        const html = window.marked ? window.marked.parse(md) : md.replace(/\n/g,'<br>');
                        detailsEl.innerHTML = html;
                        detailsEl.dataset.loaded = 'true';
                    } catch (err) {
                        detailsEl.innerHTML = `<div style="color:#c00">加载正文失败: ${err.message}</div>`;
                        detailsEl.dataset.loaded = 'true';
                    }
                };
                const expand = (ev) => {
                    ev && ev.preventDefault();
                    ev && ev.stopPropagation();
                    loadBodyHtml();
                    detailsEl.style.maxHeight = detailsEl.scrollHeight + 'px';
                    expandBtn.style.display = 'none';
                    collapseBtn.style.display = 'inline-block';
                };
                const collapse = (ev) => {
                    ev && ev.preventDefault();
                    ev && ev.stopPropagation();
                    detailsEl.style.maxHeight = '0';
                    collapseBtn.style.display = 'none';
                    expandBtn.style.display = 'inline-block';
                };
                expandBtn.addEventListener('click', expand, { passive: false });
                collapseBtn.addEventListener('click', collapse, { passive: false });
                // 触控优化：使用 touchstart 响应更快，阻止误触传播
                expandBtn.addEventListener('touchstart', expand, { passive: false });
                collapseBtn.addEventListener('touchstart', collapse, { passive: false });
            }
        }

        // 限制最多5个，超出则关闭最早打开的一个
        if (openNotes.length > 5) {
            let oldest = openNotes[0];
            for (let i = 1; i < openNotes.length; i++) {
                if (openNotes[i].openedAt < oldest.openedAt) {
                    oldest = openNotes[i];
                }
            }
            // 关闭最早的弹窗
            if (oldest && oldest.popup && oldest.popup._source) {
                oldest.popup._source.closePopup();
            }
        }
    });

    map.on('popupclose', function(e) {
        const popup = e.popup;
        const source = popup._source;
        if (!source) return;
        const id = source._leaflet_id;
        openNotes = openNotes.filter(n => n.id !== id);
    });

    // 加载已保存的图钉
    loadPins();
}

// 显示添加图钉的弹窗
function showPinModal() {
    const modal = document.getElementById('pinModal');
    modal.style.display = 'block';
    
    // 只在非编辑模式下清空表单
    if (!isEditMode) {
        document.getElementById('pinForm').reset();
        // 设置默认样式值
        document.getElementById('modalPinColor').value = 'auto';
        document.getElementById('modalPinStyle').value = 'circle';
        // 清空已选标签
        const selectedTagsList = document.getElementById('selectedTagsList');
        if (selectedTagsList) {
            selectedTagsList.innerHTML = '';
        }
        // 重置标题计数器
        const titleCounter = document.getElementById('titleCounter');
        const titleInput = document.getElementById('title');
        if (titleCounter && titleInput) {
            titleCounter.textContent = `${titleInput.value.length} / 50`;
        }
    }
}

// 隐藏弹窗
function hideModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// 从本地存储加载图钉
function loadPins() {
    const savedPins = localStorage.getItem('historyMapPins');
    if (savedPins) {
        const pinsData = JSON.parse(savedPins);
        pinsData.forEach(pinData => {
            // 迁移旧数据：year -> date
            normalizePinDate(pinData);
            // 迁移旧数据：notes -> title/body
            normalizePinFields(pinData);
            createPinFromData(pinData);
        });
    }
}

// 从数据创建图钉
function createPinFromData(pinData) {
    // 标准化日期字段，兼容旧的 year
    normalizePinDate(pinData);
    // 标准化字段（兼容旧notes）
    normalizePinFields(pinData);
    const { lat, lng, date, category, title, body, color, style } = pinData;
    
    // 创建图钉标记
    const marker = L.marker([lat, lng], {
        icon: createCustomIcon(color || 'auto', style || 'circle')
    }).addTo(map);
    
    // 绑定弹出窗口
    const popupContent = buildPopupContent({ date, category, title }, marker._leaflet_id);
    
    marker.bindPopup(popupContent, { autoClose: false, closeOnClick: false, className: 'note-popup' });
    
    // 存储图钉数据
    pins[marker._leaflet_id] = {
        marker: marker,
        data: pinData
    };
    
    return marker;
}

// 创建自定义图标
function createCustomIcon(color, style) {
    const colors = {
        'auto': '#3388ff',
        'red': '#ff0000',
        'blue': '#0000ff',
        'green': '#008000',
        'yellow': '#ffff00',
        'purple': '#800080',
        'orange': '#ffa500'
    };
    
    const iconColor = colors[color] || colors['auto'];
    
    let styleAttribute;
    if (style === 'triangle') {
        styleAttribute = `border-bottom-color: ${iconColor};`;
    } else {
        styleAttribute = `background-color: ${iconColor};`;
    }
    
    return L.divIcon({
        className: 'custom-pin',
        html: `<div class="pin-${style}" style="${styleAttribute}"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9]
    });
}

// 保存图钉到本地存储
function savePins() {
    const pinsData = Object.values(pins).map(pin => pin.data);
    localStorage.setItem('historyMapPins', JSON.stringify(pinsData));
    // 更新标签过滤器选项
    initializeTagFilter();
}

// 获取选中的标签
function getSelectedTags() {
    const selectedTagsList = document.getElementById('selectedTagsList');
    if (!selectedTagsList) return '';
    
    const tags = [];
    const tagElements = selectedTagsList.querySelectorAll('.selected-tag');
    tagElements.forEach(tag => {
        tags.push(tag.textContent.replace('×', '').trim());
    });
    return tags.join(', ');
}

// 设置选中的标签
function setSelectedTags(categoryString) {
    const selectedTagsList = document.getElementById('selectedTagsList');
    if (!selectedTagsList) return;
    
    // 清空现有标签
    selectedTagsList.innerHTML = '';
    
    if (categoryString) {
        // 分割多个标签（假设用逗号分隔）
        const tags = categoryString.split(',').map(tag => tag.trim()).filter(tag => tag);
        
        tags.forEach(tag => {
            const tagElement = document.createElement('span');
            tagElement.className = 'selected-tag';
            tagElement.textContent = tag;
            
            // 添加点击移除功能
            tagElement.addEventListener('click', function() {
                tagElement.remove();
            });
            
            selectedTagsList.appendChild(tagElement);
        });
    }
}

// 编辑图钉
function editPin(markerId) {
    const pin = pins[markerId];
    if (!pin) return;
    
    isEditMode = true;
    currentEditingPin = markerId;
    
    // 填充表单
    const data = pin.data;
    document.getElementById('date').value = data.date || '';
    setSelectedTags(data.category); // 设置选中的标签
    // 兼容旧字段
    const titleInput = document.getElementById('title');
    const bodyInput = document.getElementById('body');
    if (titleInput) titleInput.value = data.title || deriveTitle(data.notes || '');
    if (bodyInput) bodyInput.value = data.body || data.notes || '';
    const titleCounter = document.getElementById('titleCounter');
    if (titleCounter && titleInput) titleCounter.textContent = `${titleInput.value.length} / 50`;
    document.getElementById('modalPinColor').value = data.color || 'auto';
    document.getElementById('modalPinStyle').value = data.style || 'circle';
    
    showPinModal();
}

// 删除图钉
function deletePin(markerId) {
    const pin = pins[markerId];
    if (!pin) return;
    
    if (confirm('确定要删除这个图钉吗？')) {
        map.removeLayer(pin.marker);
        delete pins[markerId];
        savePins();
    }
}

// 保存图钉为md文件
function savePinAsMarkdown(pinData) {
    // 获取经度和纬度的前两位小数
    const lngPrefix = Math.abs(pinData.lng).toFixed(2).replace('.', '');
    const latPrefix = Math.abs(pinData.lat).toFixed(2).replace('.', '');
    const filename = `Pin_${pinData.date}_${lngPrefix}_${latPrefix}.md`;
    const content = `# 历史标记

**日期:** ${pinData.date}

**位置:** ${pinData.lat.toFixed(6)}, ${pinData.lng.toFixed(6)}

**标签:** ${pinData.category}

**颜色:** ${pinData.color}

**样式:** ${pinData.style}

## 标题

${(pinData.title || deriveTitle(pinData.body || pinData.notes || '')).slice(0,50) || '未命名'}

## 正文

${pinData.body || pinData.notes || '无'}`;
    
    // 创建下载链接
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log(`图钉已保存为: ${filename}`);
}

// 添加新图钉
function addPin(lat, lng, date, category, title, body, color, style) {
    const pinData = {
        lat: lat,
        lng: lng,
        date: date,
        category: category,
        title: (title || '').slice(0,50) || deriveTitle(body || ''),
        body: body || '',
        color: color,
        style: style
    };
    
    createPinFromData(pinData);
    savePins();
    
    // 保存为md文件
    savePinAsMarkdown(pinData);
}

// DOMContentLoaded事件
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded');
    initMap();
    
    // 绑定表单提交事件
    const pinFormEl = document.getElementById('pinForm');
    pinFormEl.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const date = document.getElementById('date').value.trim();
        if (!isValidDateString(date)) {
            alert('日期格式不正确，需为YYYY-MM-DD，可选负号表示公元前');
            return;
        }
        const category = getSelectedTags(); // 获取选中的标签
        const title = (document.getElementById('title').value || '').trim();
        const body = (document.getElementById('body').value || '').trim();
        // 标题必填且≤50字
        if (!title) {
            alert('请填写标题（必填，≤50字）');
            return;
        }
        const finalTitle = title.slice(0,50);
        const color = document.getElementById('modalPinColor').value;
        const style = document.getElementById('modalPinStyle').value;
        
        if (isEditMode && currentEditingPin) {
            // 编辑模式
            const pin = pins[currentEditingPin];
            if (pin) {
                // 更新数据
                pin.data.date = date;
                pin.data.category = category;
                pin.data.title = finalTitle;
                pin.data.body = body;
                pin.data.color = color;
                pin.data.style = style;
                
                // 更新图标
                pin.marker.setIcon(createCustomIcon(color, style));
                
                // 更新弹出窗口
                const popupContent = buildPopupContent({ date, category, title: finalTitle }, currentEditingPin);
                pin.marker.setPopupContent(popupContent);
                
                savePins();
            }
            
            isEditMode = false;
            currentEditingPin = null;
        } else {
            // 添加模式
            if (currentLatLng) {
                addPin(currentLatLng.lat, currentLatLng.lng, date, category, finalTitle, body, color, style);
                currentLatLng = null;
            }
        }
        
        hideModal('pinModal');
    });

    // 标题输入计数器
    const titleInput = document.getElementById('title');
    const titleCounter = document.getElementById('titleCounter');
    if (titleInput && titleCounter) {
        titleInput.addEventListener('input', function() {
            titleCounter.textContent = `${this.value.length} / 50`;
        }, { passive: true });
    }

    // 城市名称开关已移除
    
    // 绑定取消按钮
    document.getElementById('cancelBtn').addEventListener('click', function() {
        hideModal('pinModal');
        isEditMode = false;
        currentEditingPin = null;
        currentLatLng = null;
     });
     
     // 绑定“保存为MD”按钮
     document.getElementById('saveAsMarkdownBtn').addEventListener('click', function() {
         
         // 收集表单数据
         const date = document.getElementById('date').value.trim();
         if (!isValidDateString(date)) {
             alert('日期格式不正确，需为YYYY-MM-DD，可选负号表示公元前');
             return;
         }
         const title = (document.getElementById('title').value || '').trim();
         const body = (document.getElementById('body').value || '').trim();
         if (!title) {
             alert('请填写标题（必填，≤50字）');
             return;
         }
         const finalTitle = title.slice(0,50);
         const selectedTags = getSelectedTags(); // 这已经是字符串了
         const color = document.getElementById('modalPinColor').value;
         const style = document.getElementById('modalPinStyle').value;
         
         // 获取位置信息
         let lat, lng;
         if (isEditMode && currentEditingPin !== null) {
             // 编辑模式：从被编辑的图钉获取位置
             const editingPin = pins[currentEditingPin];
             if (editingPin && editingPin.data) {
                 lat = editingPin.data.lat;
                 lng = editingPin.data.lng;
             } else {
                 alert('无法获取图钉位置信息');
                 return;
             }
         } else {
             // 新建模式：从currentLatLng获取位置
             if (!currentLatLng) {
                 alert('请先在地图上选择位置');
                 return;
             }
             lat = currentLatLng.lat;
             lng = currentLatLng.lng;
         }
         
         // 构建图钉数据
         const pinData = {
             date: date,
             category: selectedTags, // 字符串，无需 join
             title: finalTitle,
             body: body || '',
             lat: lat,
             lng: lng,
             color: color,
             style: style
         };
         
         // 保存为markdown文件
         savePinAsMarkdown(pinData);
         
         // 显示成功提示
          alert('图钉已保存为MD文件');
      });
     
     // 绑定导入按钮
     document.getElementById('importBtn').addEventListener('click', function() {
         document.getElementById('fileInput').click();
     });
     
     // 绑定文件选择
     document.getElementById('fileInput').addEventListener('change', function(e) {
         const files = e.target.files;
         if (files.length > 0) {
             importMarkdownFiles(files);
         }
     });
     
     // 绑定工具栏按钮
    document.getElementById('pinToolBtn').addEventListener('click', function() {
        currentTool = 'pin';
        updateToolButtons();
        activatePinHover();
    });
     
    document.getElementById('selectToolBtn').addEventListener('click', function() {
        currentTool = 'select';
        updateToolButtons();
        // 选择工具作为退出机制
        deactivatePinHover('select');
    });
     
     // 绑定过滤器
     document.getElementById('tagFilter').addEventListener('change', function() {
         filterPinsByTag(this.value);
     });
     
    // 绑定日期过滤器（六输入框）
    const startYearInput = document.getElementById('startYear');
    const startMonthInput = document.getElementById('startMonth');
    const startDayInput = document.getElementById('startDay');
    const endYearInput = document.getElementById('endYear');
    const endMonthInput = document.getElementById('endMonth');
    const endDayInput = document.getElementById('endDay');
    const dateInputs = [startYearInput, startMonthInput, startDayInput, endYearInput, endMonthInput, endDayInput].filter(Boolean);
    dateInputs.forEach(inp => inp.addEventListener('input', () => filterPinsByDate()));
     // 绑定过滤与清除按钮
    const filterBtn = document.getElementById('filterBtn');
    const clearFilterBtn = document.getElementById('clearFilterBtn');
    if (filterBtn) {
        filterBtn.addEventListener('click', function() {
            const visibleCount = filterPinsByDate();
            if (visibleCount === 0) alert('没有符合条件的标记');
        });
    }
    if (clearFilterBtn) {
        clearFilterBtn.addEventListener('click', function() {
            ['startYear','startMonth','startDay','endYear','endMonth','endDay'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.value = '';
                    el.classList.remove('input-error');
                }
            });
            const msg = document.getElementById('dateFilterMsg');
            if (msg) msg.textContent = '';
            // 显示全部
            Object.values(pins).forEach(pin => pin.marker.addTo(map));
        });
    }
     
    // 初始化标签选项
    initializeTagFilter();
     
     // 绑定图层按钮
     document.getElementById('layerBtn').addEventListener('click', function() {
         const dropdown = document.getElementById('layerDropdown');
         dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
     });
     
     // 绑定图层选项
     document.querySelectorAll('.layer-option').forEach(option => {
         option.addEventListener('click', function() {
             const layerType = this.getAttribute('data-layer');
             switchMapLayer(layerType);
             document.getElementById('layerDropdown').style.display = 'none';
         });
     });

    // 功能变更：帮助按钮不再打开本地或在线文档。
    // 现改为点击后显示固定提示文本，保持按钮 UI 不变。
    const helpBtn = document.getElementById('helpBtn');
    if (helpBtn) {
        helpBtn.addEventListener('click', function() {
            alert('打开本地文件夹的Readme文档查看帮助。');
        });
    }
     
     // 绑定弹窗关闭按钮
     document.querySelectorAll('.close').forEach(closeBtn => {
         closeBtn.addEventListener('click', function() {
             const modal = this.closest('.modal');
             hideModal(modal.id);
         });
     });
     
     // 点击弹窗外部关闭
     document.querySelectorAll('.modal').forEach(modal => {
         modal.addEventListener('click', function(e) {
             if (e.target === this) {
                 hideModal(this.id);
             }
         });
     });
});

// 更新按钮视觉反馈
// 城市显示相关函数已移除

// 更新工具按钮状态
function updateToolButtons() {
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const mapElement = document.getElementById('map');
    
    if (currentTool === 'pin') {
        document.getElementById('pinToolBtn').classList.add('active');
        mapElement.classList.remove('select-mode');
        mapElement.classList.add('pin-mode');
    } else if (currentTool === 'select') {
        document.getElementById('selectToolBtn').classList.add('active');
        mapElement.classList.remove('pin-mode');
        mapElement.classList.add('select-mode');
    }
}

// —— Popup 内容构建与交互 ——
function humanDate(dateStr) {
    if (!dateStr) return '';
    const m = dateStr.match(/^(-)?(\d{1,4})-(\d{2})-(\d{2})$/);
    if (!m) return dateStr;
    const sign = m[1] ? -1 : 1;
    const year = parseInt(m[2], 10) * sign;
    const rest = `${m[3]}-${m[4]}`;
    return year < 0 ? `公元前${String(Math.abs(year)).padStart(4,'0')}-${rest}` : `${String(year).padStart(4,'0')}-${rest}`;
}

function buildPopupContent({ date, category, title }, markerId) {
    const tags = (category || '').split(',').map(t => t.trim()).filter(Boolean);
    const tagsHtml = tags.map(t => `<span class="tag-badge">${t}</span>`).join(' ');
    const escapedTitle = (title || '未命名').slice(0,50);
    return `
        <div class="popup-content" data-marker-id="${markerId}">
            <div class="popup-header">
                <div class="popup-time">${humanDate(date)}</div>
                <div class="popup-tags">${tagsHtml}</div>
                <div class="popup-title" style="font-weight:600; margin-top:6px;">${escapedTitle}</div>
            </div>
            <div class="popup-actions">
                <button class="btn-expand" data-action="expand" aria-label="展开详情">▶ 展开详情</button>
                <button class="btn-collapse" data-action="collapse" style="display:none" aria-label="收起详情">▲ 收起</button>
                <button onclick="editPin('${markerId}')">编辑</button>
                <button onclick="deletePin('${markerId}')">删除</button>
            </div>
            <div class="popup-details" data-loaded="false"></div>
        </div>
    `;
}

// 激活图钉坐标悬浮提示
function activatePinHover() {
    // 若地图未初始化，报错并回退
    if (!map) {
        console.error('定位服务不可用：地图未初始化');
        showTransientError('定位服务不可用');
        return;
    }

    // 创建提示元素（如不存在）
    if (!pinHoverTooltipEl) {
        pinHoverTooltipEl = document.createElement('div');
        pinHoverTooltipEl.id = 'pinHoverTooltip';
        pinHoverTooltipEl.className = 'coords-tooltip';
        pinHoverTooltipEl.style.display = 'none';
        document.body.appendChild(pinHoverTooltipEl);
    }

    // 鼠标移动事件：记录位置与对应坐标
    pinMouseMoveHandler = function(e) {
        // e.containerPoint/e.originalEvent 提供页面坐标
        const oe = e.originalEvent || e; // Leaflet 事件含 originalEvent
        pinLastMousePos.x = oe.pageX;
        pinLastMousePos.y = oe.pageY;

        // 从事件获取高精度经纬度（Leaflet 提供当前像素对应坐标）
        if (e.latlng) {
            pinLastLatLng = e.latlng;
        } else if (oe) {
            try {
                const ll = map.mouseEventToLatLng(oe);
                pinLastLatLng = ll;
            } catch (err) {
                // 保持现状，定时器中处理错误
            }
        }
    };
    map.on('mousemove', pinMouseMoveHandler);

    // ESC 键退出
    pinEscKeyHandler = function(ev) {
        if (ev.key === 'Escape') {
            deactivatePinHover('esc');
            currentTool = 'select';
            updateToolButtons();
        }
    };
    document.addEventListener('keydown', pinEscKeyHandler);

    // 启动100ms刷新定时器
    if (pinHoverIntervalId) {
        clearInterval(pinHoverIntervalId);
    }
    pinHoverIntervalId = setInterval(() => {
        if (!pinHoverTooltipEl) return;

        // 坐标不可用时错误提示（不打断主流程）
        if (!pinLastLatLng) {
            pinHoverTooltipEl.textContent = '定位不可用';
            pinHoverTooltipEl.style.display = 'block';
            pinHoverTooltipEl.style.left = (pinLastMousePos.x + 10) + 'px';
            pinHoverTooltipEl.style.top = (pinLastMousePos.y + 10) + 'px';
            return;
        }

        const lng = Number(pinLastLatLng.lng).toFixed(2);
        const lat = Number(pinLastLatLng.lat).toFixed(2);
        pinHoverTooltipEl.textContent = `经度: ${lng}, 纬度: ${lat}`;
        pinHoverTooltipEl.style.display = 'block';
        pinHoverTooltipEl.style.left = (pinLastMousePos.x + 10) + 'px';
        pinHoverTooltipEl.style.top = (pinLastMousePos.y + 10) + 'px';
    }, 50);
}

// 退出并清理坐标悬浮提示
function deactivatePinHover(reason = '') {
    // 停止定时器
    if (pinHoverIntervalId) {
        clearInterval(pinHoverIntervalId);
        pinHoverIntervalId = null;
    }

    // 移除事件监听
    if (map && pinMouseMoveHandler) {
        map.off('mousemove', pinMouseMoveHandler);
        pinMouseMoveHandler = null;
    }
    if (pinEscKeyHandler) {
        document.removeEventListener('keydown', pinEscKeyHandler);
        pinEscKeyHandler = null;
    }

    // 移除UI元素
    if (pinHoverTooltipEl && pinHoverTooltipEl.parentNode) {
        pinHoverTooltipEl.parentNode.removeChild(pinHoverTooltipEl);
        pinHoverTooltipEl = null;
    }

    // 恢复默认鼠标光标样式由 updateToolButtons 控制
}

// 非阻断式错误提示（2秒自动消失）
function showTransientError(message) {
    const tip = document.createElement('div');
    tip.className = 'coords-tooltip error';
    tip.textContent = message || '发生错误';
    document.body.appendChild(tip);
    // 居中显示
    tip.style.left = '50%';
    tip.style.top = '20px';
    tip.style.transform = 'translateX(-50%)';
    setTimeout(() => {
        if (tip && tip.parentNode) tip.parentNode.removeChild(tip);
    }, 2000);
}

// 帮助弹窗 Web Component
class HelpModal extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.state = {
            minimized: false,
            maximized: false,
            contentMarkdown: '',
            contentHtml: '',
            lastQuery: ''
        };
        this.debounceTimer = null;
    }
    connectedCallback() {
        this.render();
        this.loadReadme();
        this.bindEvents();
    }
    render() {
        const style = `
            :host { position: fixed; z-index: 2500; display: none; }
            .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); }
            .modal { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
                     width: 800px; height: 600px; background: #fff; color: #333; border-radius: 8px;
                     box-shadow: 0 12px 30px rgba(0,0,0,0.3); overflow: hidden; display: flex; flex-direction: column; }
            .header { background: #2d6cdf; color: #fff; padding: 8px 12px; display: flex; align-items: center; gap: 8px; }
            .title { flex: 1; font-weight: 600; }
            .actions button { border: none; background: rgba(255,255,255,0.2); color: #fff; padding: 6px 8px; border-radius: 4px; cursor: pointer; }
            .actions button:hover { background: rgba(255,255,255,0.3); }
            .body { display: flex; flex-direction: column; height: 100%; }
            .toolbar { display:flex; gap:8px; padding:8px; border-bottom:1px solid #eee; align-items:center; }
            .toolbar input { flex:1; padding:6px 8px; border:1px solid #ddd; border-radius:4px; }
            .content { flex:1; overflow:auto; padding:12px; }
            .resizer { position:absolute; right:8px; bottom:8px; width:16px; height:16px; cursor: se-resize; opacity:0.6; }
            .minimized .body { display: none; }
            .minimized .modal { height: 48px; width: 320px; }
            .maximized .modal { width: 90vw; height: 90vh; }
            .code pre { background:#f6f8fa; padding:8px; border-radius:4px; overflow:auto; }
            mark { background: #ffeb3b; }
        `;
        const html = `
            <div class="backdrop" part="backdrop"></div>
            <div class="modal" part="modal">
                <div class="header" part="header">
                    <div class="title">帮助文档</div>
                    <div class="actions">
                        <button class="btn-min">最小化</button>
                        <button class="btn-max">最大化</button>
                        <button class="btn-close">关闭</button>
                    </div>
                </div>
                <div class="body">
                    <div class="toolbar">
                        <input type="text" class="search" placeholder="搜索帮助内容... (支持关键字高亮)" />
                        <button class="btn-refresh">刷新</button>
                    </div>
                    <div class="content" part="content"></div>
                </div>
                <svg class="resizer" viewBox="0 0 16 16" aria-hidden="true"><path d="M0 16 L16 0 M6 16 L16 6 M12 16 L16 12" stroke="#666"/></svg>
            </div>
        `;
        this.shadowRoot.innerHTML = `<style>${style}</style>${html}`;
        // 允许原生 resize
        const modalEl = this.shadowRoot.querySelector('.modal');
        modalEl.style.resize = 'both';
    }
    bindEvents() {
        const root = this.shadowRoot;
        root.querySelector('.btn-close').addEventListener('click', () => this.close());
        root.querySelector('.btn-min').addEventListener('click', () => this.toggleMinimize());
        root.querySelector('.btn-max').addEventListener('click', () => this.toggleMaximize());
        root.querySelector('.btn-refresh').addEventListener('click', () => this.loadReadme());
        root.querySelector('.backdrop').addEventListener('click', () => this.close());
        const searchInput = root.querySelector('.search');
        searchInput.addEventListener('input', () => {
            clearTimeout(this.debounceTimer);
            const q = searchInput.value.trim();
            this.debounceTimer = setTimeout(() => this.applySearch(q), 150);
        });
    }
    open() {
        this.style.display = 'block';
        // 若尚未加载，尝试加载
        if (!this.state.contentMarkdown) this.loadReadme();
    }
    close() {
        this.style.display = 'none';
    }
    toggleMinimize() {
        this.state.minimized = !this.state.minimized;
        this.classList.toggle('minimized', this.state.minimized);
    }
    toggleMaximize() {
        this.state.maximized = !this.state.maximized;
        this.classList.toggle('maximized', this.state.maximized);
    }
    async loadReadme() {
        // 兼容不同预览根路径：依次尝试多种候选位置
        const candidates = [
            'Readme.md',
            './Readme.md',
            'HistoryMap/Readme.md'
        ];
        let lastError = null;
        for (const path of candidates) {
            try {
                const resp = await fetch(path, { cache: 'no-store' });
                if (!resp.ok) throw new Error(`读取 ${path} 失败 (${resp.status})`);
                const text = await resp.text();
                this.state.contentMarkdown = text;
                this.renderMarkdown(text);
                return; // 加载成功，直接返回
            } catch (err) {
                lastError = err;
            }
        }
        const msg = `无法加载帮助文档：${lastError ? lastError.message : '未知错误'}`;
        const extra = (window.location && window.location.protocol === 'file:')
            ? `
由于浏览器安全策略，直接用 \`file://\` 打开页面可能无法通过网络接口读取本地文件。
建议通过本地服务器方式访问页面（例如 localhost）。
`
            : '';
        this.renderMarkdown(`# 帮助文档

> ${msg}

已尝试路径：${candidates.map(c => `\`${c}\``).join('、')}

请确认上述路径至少存在一个有效的 \`Readme.md\` 文件。
${extra}`);
    }
    renderMarkdown(md, query = '') {
        try {
            const html = (window.marked ? window.marked.parse(md) : md);
            this.state.contentHtml = html;
            this.applySearch(query);
        } catch (err) {
            this.shadowRoot.querySelector('.content').innerHTML = `<pre>${md}</pre>`;
        }
    }
    applySearch(query) {
        this.state.lastQuery = query;
        let html = this.state.contentHtml || '';
        if (query) {
            const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(esc, 'gi');
            html = html.replace(re, (m) => `<mark>${m}</mark>`);
        }
        this.shadowRoot.querySelector('.content').innerHTML = html;
    }
}

customElements.define('help-modal', HelpModal);

// 根据标签过滤图钉
function filterPinsByTag(tag) {
    Object.values(pins).forEach(pin => {
        const marker = pin.marker;
        const pinCategory = pin.data.category;
        
        if (!tag || pinCategory.includes(tag)) {
            marker.addTo(map);
        } else {
            map.removeLayer(marker);
        }
    });
}

// 根据年份过滤图钉
function filterPinsByDate() {
    const msgEl = document.getElementById('dateFilterMsg');
    const setMsg = (t) => { if (msgEl) msgEl.textContent = t; };
    const clearErrors = () => {
        ['startYear','startMonth','startDay','endYear','endMonth','endDay'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('input-error');
        });
    };
    clearErrors();
    const sy = (document.getElementById('startYear')?.value || '').trim();
    const sm = (document.getElementById('startMonth')?.value || '').trim();
    const sd = (document.getElementById('startDay')?.value || '').trim();
    const ey = (document.getElementById('endYear')?.value || '').trim();
    const em = (document.getElementById('endMonth')?.value || '').trim();
    const ed = (document.getElementById('endDay')?.value || '').trim();

    // 年份强制校验
    if (!sy && !ey) {
        setMsg('必须填写年份');
        ['startYear','endYear'].forEach(id => document.getElementById(id)?.classList.add('input-error'));
        return 0;
    }
    // 年份个别校验（友好提示）
    const yearRe = /^-?\d{1,4}$/;
    if (sy && !yearRe.test(sy)) {
        setMsg('起始年份格式应为 YYYY 或 -YYYY');
        document.getElementById('startYear')?.classList.add('input-error');
        return 0;
    }
    if (ey && !yearRe.test(ey)) {
        setMsg('结束年份格式应为 YYYY 或 -YYYY');
        document.getElementById('endYear')?.classList.add('input-error');
        return 0;
    }
    if (!sy) {
        setMsg('起始年份不能为空');
        document.getElementById('startYear')?.classList.add('input-error');
        return 0;
    }
    if (!ey) {
        setMsg('结束年份不能为空');
        document.getElementById('endYear')?.classList.add('input-error');
        return 0;
    }

    // 默认值与范围处理
    let defaultsNote = [];
    let sYear = parseInt(sy, 10);
    let sMonth = sm ? parseInt(sm, 10) : 1; // 默认 01
    let sDay = sd ? parseInt(sd, 10) : 1;   // 默认 01
    if (!sm) defaultsNote.push('起始月份未填写，已默认 01');
    if (!sd) defaultsNote.push('起始日期未填写，已默认 01');

    let eYear = parseInt(ey, 10);
    let eMonth = em ? parseInt(em, 10) : 12; // 默认 12
    let eDay = ed ? parseInt(ed, 10) : 31;   // 默认 31（将按当月最大天数校正）
    if (!em) defaultsNote.push('结束月份未填写，已默认 12');
    if (!ed) defaultsNote.push('结束日期未填写，已默认 31');

    // 月份范围校验
    const monthRangeOk = (m) => m >= 1 && m <= 12;
    if (!monthRangeOk(sMonth)) {
        setMsg('起始月份需为 1-12');
        document.getElementById('startMonth')?.classList.add('input-error');
        return 0;
    }
    if (!monthRangeOk(eMonth)) {
        setMsg('结束月份需为 1-12');
        document.getElementById('endMonth')?.classList.add('input-error');
        return 0;
    }

    // 日期范围校验（考虑闰年与月份天数）
    const sMaxDay = daysInMonth(sYear, sMonth);
    const eMaxDay = daysInMonth(eYear, eMonth);
    if (sd) {
        if (sDay < 1 || sDay > sMaxDay) {
            setMsg(`起始日期无效：当月最多 ${sMaxDay} 天`);
            document.getElementById('startDay')?.classList.add('input-error');
            return 0;
        }
    } else {
        sDay = Math.min(sDay, sMaxDay); // 默认 01 不会越界，但保守处理
    }
    const endDayWasDefault = !ed;
    if (ed) {
        if (eDay < 1 || eDay > eMaxDay) {
            setMsg(`结束日期无效：当月最多 ${eMaxDay} 天`);
            document.getElementById('endDay')?.classList.add('input-error');
            return 0;
        }
    } else {
        if (eDay > eMaxDay) {
            eDay = eMaxDay; // 默认 31 校正为当月最后一天
            defaultsNote.push(`结束日期已按当月最后一天调整为 ${String(eDay).padStart(2,'0')}`);
        }
    }

    // 组装为 YYYY-MM-DD（内部保持分字段）
    const startStr = `${formatYear(sYear)}-${pad2(sMonth)}-${pad2(sDay)}`;
    const endStr = `${formatYear(eYear)}-${pad2(eMonth)}-${pad2(eDay)}`;

    // 起始不得晚于结束
    const startKey = dateKey(startStr);
    const endKey = dateKey(endStr);
    if (startKey > endKey) {
        setMsg('起始日期不能晚于结束日期');
        ['startYear','startMonth','startDay'].forEach(id => document.getElementById(id)?.classList.add('input-error'));
        return 0;
    }

    // 执行过滤
    let visible = 0;
    Object.values(pins).forEach(pin => {
        const marker = pin.marker;
        normalizePinDate(pin.data);
        const key = dateKey(pin.data.date);
        if (key >= startKey && key <= endKey) {
            marker.addTo(map);
            visible++;
        } else {
            map.removeLayer(marker);
        }
    });
    // 提示默认值应用
    if (defaultsNote.length) setMsg(defaultsNote.join('；'));
    else setMsg('');
    return visible;
}

// 初始化标签过滤器选项
function initializeTagFilter() {
    const tagFilter = document.getElementById('tagFilter');
    
    // 清空现有选项（保留"显示全部"）
    while (tagFilter.children.length > 1) {
        tagFilter.removeChild(tagFilter.lastChild);
    }
    
    // 从现有图钉中收集所有标签
    const usedTags = new Set();
    Object.values(pins).forEach(pin => {
        if (pin.data.category) {
            const categories = pin.data.category.split(',').map(cat => cat.trim());
            categories.forEach(cat => usedTags.add(cat));
        }
    });
    
    // 添加预定义标签和使用过的标签
    const allTags = new Set([...availableTags, ...usedTags]);
    
    allTags.forEach(tag => {
        const option = document.createElement('option');
        option.value = tag;
        option.textContent = tag;
        tagFilter.appendChild(option);
    });
    
    // 初始化标签选择器
    initializeTagSelector();
}

// 初始化标签选择器
function initializeTagSelector() {
    const availableTagsContainer = document.getElementById('availableTags');
    if (!availableTagsContainer) return;
    
    availableTagsContainer.innerHTML = '';
    
    availableTags.forEach(tag => {
        const tagElement = document.createElement('div');
        tagElement.className = 'tag-item';
        tagElement.textContent = tag;
        tagElement.addEventListener('click', function() {
            selectTag(tag);
        });
        availableTagsContainer.appendChild(tagElement);
    });
}

// 选择标签
function selectTag(tag) {
    const selectedTagsList = document.getElementById('selectedTagsList');
    if (!selectedTagsList) return;
    
    // 检查是否已经选择
    const existingTags = selectedTagsList.querySelectorAll('.selected-tag');
    for (let existingTag of existingTags) {
        if (existingTag.textContent.trim() === tag) {
            return; // 已经选择，不重复添加
        }
    }
    
    // 添加选中的标签
    const tagElement = document.createElement('span');
    tagElement.className = 'selected-tag';
    tagElement.textContent = tag;
    
    // 添加点击移除功能（使用CSS的::after伪元素显示×）
    tagElement.addEventListener('click', function() {
        tagElement.remove();
    });
    
    selectedTagsList.appendChild(tagElement);
}

// 切换地图图层
function switchMapLayer(layerType) {
    // 移除当前图层
    if (mapLayers[currentLayer]) {
        map.removeLayer(mapLayers[currentLayer]);
    }
    
    // 更新当前图层类型
    currentLayer = layerType;
    
    // 添加新图层
    if (mapLayers[layerType]) {
        mapLayers[layerType].addTo(map);
    }

    // 城市显示联动已移除
}

// 导入Markdown文件
function importMarkdownFiles(files) {
    let importedCount = 0;
    
    Array.from(files).forEach(file => {
        if (file.name.endsWith('.md')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const content = e.target.result;
                const pins = parseMarkdownContent(content, file.name);
                
                pins.forEach(pinData => {
                    createPinFromData(pinData);
                    importedCount++;
                });
                
                savePins();
                
                if (importedCount > 0) {
                    alert(`成功导入 ${importedCount} 个图钉！`);
                }
            };
            reader.readAsText(file);
        }
    });
}

// 解析Markdown内容
function parseMarkdownContent(content, filename) {
    const pins = [];
    const lines = content.split('\n');
    
    let currentPin = null;
    let inTitleSection = false;
    let inBodySection = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // 检测历史标记标题
        if (line === '# 历史标记') {
            currentPin = {
                date: null,
                category: '',
                title: '',
                body: '',
                lat: 39.9042, // 默认北京坐标
                lng: 116.4074,
                color: 'auto',
                style: 'circle'
            };
            inTitleSection = false;
            inBodySection = false;
            continue;
        }
        
        if (!currentPin) continue;
        
        // 检测日期（新格式）
        const dateMatch = line.match(/\*\*日期:\*\*\s*([-]?\d{1,4}-\d{2}-\d{2})/);
        if (dateMatch) {
            currentPin.date = dateMatch[1];
            continue;
        }
        // 兼容旧格式：年份
        const yearMatch = line.match(/\*\*年份:\*\*\s*(-?\d{1,4})/);
        if (yearMatch) {
            const y = parseInt(yearMatch[1]);
            const yStr = (y >= 0 ? String(y).padStart(4, '0') : '-' + String(Math.abs(y)).padStart(4, '0'));
            currentPin.date = `${yStr}-01-01`;
            continue;
        }
        
        // 检测位置坐标
        const locationMatch = line.match(/\*\*位置:\*\*\s*([\d.-]+),\s*([\d.-]+)/);
        if (locationMatch) {
            currentPin.lat = parseFloat(locationMatch[1]);
            currentPin.lng = parseFloat(locationMatch[2]);
            continue;
        }
        
        // 检测标签
        const tagMatch = line.match(/\*\*标签:\*\*\s*(.+)/);
        if (tagMatch) {
            currentPin.category = tagMatch[1];
            continue;
        }
        
        // 检测颜色
        const colorMatch = line.match(/\*\*颜色:\*\*\s*(\w+)/);
        if (colorMatch) {
            currentPin.color = colorMatch[1];
            continue;
        }
        
        // 检测样式
        const styleMatch = line.match(/\*\*样式:\*\*\s*(\w+)/);
        if (styleMatch) {
            currentPin.style = styleMatch[1];
            continue;
        }
        
        // 新字段：标题与正文
        if (line === '## 标题') { inTitleSection = true; inBodySection = false; continue; }
        if (line === '## 正文') { inBodySection = true; inTitleSection = false; continue; }
        // 兼容旧字段：## 笔记 当作正文
        if (line === '## 笔记') { inBodySection = true; inTitleSection = false; continue; }
        
        if (inTitleSection && line) {
            currentPin.title += line + ' ';
        }
        if (inBodySection && line && line !== '无') {
            currentPin.body += line + '\n';
        }
    }
    
    // 添加图钉（如果有有效数据）
    if (currentPin && currentPin.date !== null) {
        currentPin.title = (currentPin.title || '').trim().slice(0,50) || deriveTitle(currentPin.body || '');
        currentPin.body = (currentPin.body || '').trim();
        pins.push(currentPin);
    }
    
    return pins;
}

// —— 日期工具与迁移 ——
function isValidDateString(str) {
    if (!str) return false;
    const m = str.match(/^(-)?(\d{1,4})-(\d{2})-(\d{2})$/);
    if (!m) return false;
    const sign = m[1] ? -1 : 1;
    const year = sign * parseInt(m[2], 10);
    const month = parseInt(m[3], 10);
    const day = parseInt(m[4], 10);
    if (month < 1 || month > 12) return false;
    const mdays = [31, (isLeapYear(year) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (day < 1 || day > mdays[month - 1]) return false;
    return true;
}

function isLeapYear(y) {
    // 仅对公元纪年生效；对负年（公元前）也沿用同规则
    y = Math.abs(y);
    return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
}

function daysInMonth(year, month) {
    const m = Math.max(1, Math.min(12, month));
    const mdays = [31, (isLeapYear(year) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return mdays[m - 1];
}

function pad2(n) {
    return String(Math.abs(parseInt(n, 10))).padStart(2, '0');
}

function formatYear(y) {
    const n = parseInt(y, 10);
    const abs = Math.abs(n);
    const s = String(abs).padStart(4, '0');
    return n >= 0 ? s : '-' + s;
}

function dateKey(str) {
    // 将 YYYY-MM-DD（可带负号年）转换为可比较整数键
    const m = str.match(/^(-)?(\d{1,4})-(\d{2})-(\d{2})$/);
    if (!m) return 0;
    const sign = m[1] ? -1 : 1;
    const year = sign * parseInt(m[2], 10);
    const month = parseInt(m[3], 10);
    const day = parseInt(m[4], 10);
    return year * 10000 + month * 100 + day;
}

function normalizePinDate(pinData) {
    if (!pinData) return;
    if (pinData.date && typeof pinData.date === 'string') return;
    if (typeof pinData.year !== 'undefined' && pinData.year !== null) {
        const y = parseInt(pinData.year, 10);
        const yStr = (y >= 0 ? String(y).padStart(4, '0') : '-' + String(Math.abs(y)).padStart(4, '0'));
        pinData.date = `${yStr}-01-01`;
        delete pinData.year;
    }
}

function normalizePinFields(pinData) {
    if (!pinData) return;
    // 如果已有title/body，规范长度
    if (pinData.title || pinData.body) {
        pinData.title = (pinData.title || '').slice(0,50) || deriveTitle(pinData.body || '');
        pinData.body = pinData.body || '';
        return;
    }
    // 兼容旧notes字段
    const notes = pinData.notes || '';
    pinData.title = deriveTitle(notes);
    pinData.body = notes;
    delete pinData.notes;
}

function deriveTitle(text) {
    const t = (text || '').replace(/\r/g,'').split('\n').find(l => l.trim()) || '';
    // 优先使用首个Markdown标题行
    const h = t.match(/^\s{0,3}#{1,6}\s+(.*)$/);
    const raw = h ? h[1].trim() : t.trim();
    return raw.slice(0,50) || '未命名';
}

console.log('App loaded successfully');
