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

// 初始化地图
function initMap() {
    // 创建地图实例，中心设置为中国
    map = L.map('map').setView([35.8617, 104.1954], 4);
    
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
        })
    };
    
    // 添加默认图层
    mapLayers[currentLayer].addTo(map);
    
    // 地图点击事件
    map.on('click', function(e) {
        if (currentTool === 'pin') {
            currentLatLng = e.latlng;
            showPinModal();
        }
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
            createPinFromData(pinData);
        });
    }
}

// 从数据创建图钉
function createPinFromData(pinData) {
    const { lat, lng, year, category, notes, color, style } = pinData;
    
    // 创建图钉标记
    const marker = L.marker([lat, lng], {
        icon: createCustomIcon(color || 'auto', style || 'circle')
    }).addTo(map);
    
    // 绑定弹出窗口
    const popupContent = `
        <div class="popup-content">
            <h3>${year}年</h3>
            <p><strong>类别:</strong> ${category}</p>
            <p><strong>笔记:</strong> ${notes}</p>
            <div class="popup-actions">
                <button onclick="editPin('${marker._leaflet_id}')">编辑</button>
                <button onclick="deletePin('${marker._leaflet_id}')">删除</button>
            </div>
        </div>
    `;
    
    marker.bindPopup(popupContent);
    
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
        iconSize: [24, 24],
        iconAnchor: [12, 12]
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
    document.getElementById('year').value = data.year;
    setSelectedTags(data.category); // 设置选中的标签
    document.getElementById('notes').value = data.notes;
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
    const filename = `Pin_${pinData.year}_${lngPrefix}_${latPrefix}.md`;
    const content = `# 历史标记

**年份:** ${pinData.year}

**位置:** ${pinData.lat.toFixed(6)}, ${pinData.lng.toFixed(6)}

**标签:** ${pinData.category}

**颜色:** ${pinData.color}

**样式:** ${pinData.style}

## 笔记

${pinData.notes || '无'}`;
    
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
function addPin(lat, lng, year, category, notes, color, style) {
    const pinData = {
        lat: lat,
        lng: lng,
        year: year,
        category: category,
        notes: notes,
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
    document.getElementById('pinForm').addEventListener('submit', function(e) {
        e.preventDefault();
        
        const year = document.getElementById('year').value;
        const category = getSelectedTags(); // 获取选中的标签
        const notes = document.getElementById('notes').value;
        const color = document.getElementById('modalPinColor').value;
        const style = document.getElementById('modalPinStyle').value;
        
        if (isEditMode && currentEditingPin) {
            // 编辑模式
            const pin = pins[currentEditingPin];
            if (pin) {
                // 更新数据
                pin.data.year = year;
                pin.data.category = category;
                pin.data.notes = notes;
                pin.data.color = color;
                pin.data.style = style;
                
                // 更新图标
                pin.marker.setIcon(createCustomIcon(color, style));
                
                // 更新弹出窗口
                const popupContent = `
                    <div class="popup-content">
                        <h3>${year}年</h3>
                        <p><strong>类别:</strong> ${category}</p>
                        <p><strong>笔记:</strong> ${notes}</p>
                        <div class="popup-actions">
                            <button onclick="editPin('${currentEditingPin}')">编辑</button>
                            <button onclick="deletePin('${currentEditingPin}')">删除</button>
                        </div>
                    </div>
                `;
                pin.marker.setPopupContent(popupContent);
                
                savePins();
            }
            
            isEditMode = false;
            currentEditingPin = null;
        } else {
            // 添加模式
            if (currentLatLng) {
                addPin(currentLatLng.lat, currentLatLng.lng, year, category, notes, color, style);
                currentLatLng = null;
            }
        }
        
        hideModal('pinModal');
    });
    
    // 绑定取消按钮
    document.getElementById('cancelBtn').addEventListener('click', function() {
        hideModal('pinModal');
        isEditMode = false;
        currentEditingPin = null;
        currentLatLng = null;
     });
     
     // 绑定保存按钮
     document.getElementById('saveAsMarkdownBtn').addEventListener('click', function() {
         
         // 收集表单数据
         const year = document.getElementById('year').value;
         const notes = document.getElementById('notes').value;
         const selectedTags = getSelectedTags(); // 这已经是字符串了
         const color = document.getElementById('modalPinColor').value;
         const style = document.getElementById('modalPinStyle').value;
         
         // 验证必填字段
         if (!year) {
             alert('请填写年份');
             return;
         }
         
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
             year: parseInt(year),
             category: selectedTags, // selectedTags已经是字符串，不需要join
             notes: notes || '',
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
     });
     
     document.getElementById('selectToolBtn').addEventListener('click', function() {
         currentTool = 'select';
         updateToolButtons();
     });
     
     // 绑定过滤器
     document.getElementById('tagFilter').addEventListener('change', function() {
         filterPinsByTag(this.value);
     });
     
     // 绑定年份过滤器
     document.getElementById('startYear').addEventListener('input', function() {
         filterPinsByYear();
     });
     
     document.getElementById('endYear').addEventListener('input', function() {
         filterPinsByYear();
     });
     
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
function filterPinsByYear() {
    const startYear = parseInt(document.getElementById('startYear').value) || -3000;
    const endYear = parseInt(document.getElementById('endYear').value) || 2100;
    
    Object.values(pins).forEach(pin => {
        const marker = pin.marker;
        const pinYear = pin.data.year;
        
        if (pinYear >= startYear && pinYear <= endYear) {
            marker.addTo(map);
        } else {
            map.removeLayer(marker);
        }
    });
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
    let inNotesSection = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // 检测历史标记标题
        if (line === '# 历史标记') {
            currentPin = {
                year: null,
                category: '',
                notes: '',
                lat: 39.9042, // 默认北京坐标
                lng: 116.4074,
                color: 'auto',
                style: 'circle'
            };
            inNotesSection = false;
            continue;
        }
        
        if (!currentPin) continue;
        
        // 检测年份
        const yearMatch = line.match(/\*\*年份:\*\*\s*(\d+)/);
        if (yearMatch) {
            currentPin.year = parseInt(yearMatch[1]);
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
        
        // 检测笔记部分开始
        if (line === '## 笔记') {
            inNotesSection = true;
            continue;
        }
        
        // 收集笔记内容
        if (inNotesSection && line && line !== '无') {
            currentPin.notes += line + '\n';
        }
    }
    
    // 添加图钉（如果有有效数据）
    if (currentPin && currentPin.year !== null) {
        currentPin.notes = currentPin.notes.trim();
        pins.push(currentPin);
    }
    
    return pins;
}

console.log('App loaded successfully');