// ===================================
// CONFIGURACIÓN Y VARIABLES GLOBALES
// ===================================

// URL del Web App de Google Apps Script (REEMPLAZAR CON LA URL REAL)
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbztWaAHnVEiwWSGoMypdDy20WPPyeQxI1FtMdaOZCHWABvlXa2Ku-vzoPMwWNDveFUYOQ/exec';

// Estado de la aplicación
let state = {
    products: [],
    categories: [],
    cart: [],
    currentView: 'orden',
    selectedCategory: 'all',
    tempProduct: null
};

// ===================================
// INICIALIZACIÓN
// ===================================

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
});

async function initializeApp() {
    showLoader(true);
    await loadCategories();
    await loadProducts();
    renderProducts();
    renderCategoryFilters();
    showLoader(false);
}

// ===================================
// EVENT LISTENERS
// ===================================

function setupEventListeners() {
    // Navegación
    document.getElementById('btnOrden').addEventListener('click', () => switchView('orden'));
    document.getElementById('btnAdmin').addEventListener('click', () => switchView('admin'));
    
    // Carrito
    document.getElementById('btnClearCart').addEventListener('click', clearCart);
    document.getElementById('btnProcessOrder').addEventListener('click', processOrder);
    
    // Administración - Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab));
    });
    
    // Administración - Botones
    document.getElementById('btnNewProduct').addEventListener('click', () => openProductModal());
    document.getElementById('btnNewCategory').addEventListener('click', () => openCategoryModal());
    
    // Formularios
    document.getElementById('formProduct').addEventListener('submit', saveProduct);
    document.getElementById('formCategory').addEventListener('submit', saveCategory);
    
    // Filtros de categoría
    document.getElementById('categoryFilter').addEventListener('click', (e) => {
        if (e.target.classList.contains('category-btn')) {
            filterByCategory(e.target.dataset.category);
        }
    });
}

// ===================================
// NAVEGACIÓN Y VISTAS
// ===================================

function switchView(view) {
    // Actualizar botones de navegación
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (view === 'orden') {
        document.getElementById('btnOrden').classList.add('active');
        document.getElementById('vistaOrden').classList.add('active');
        document.getElementById('vistaAdmin').classList.remove('active');
    } else {
        document.getElementById('btnAdmin').classList.add('active');
        document.getElementById('vistaAdmin').classList.add('active');
        document.getElementById('vistaOrden').classList.remove('active');
        loadAdminData();
    }
    
    state.currentView = view;
}

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.add('active');
}

// ===================================
// COMUNICACIÓN CON GOOGLE SHEETS
// ===================================

function fetchData(action, data = {}) {
    return new Promise((resolve, reject) => {
        try {
            // Crear nombre único para el callback
            const callbackName = 'callback_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            // Construir parámetros
            const params = new URLSearchParams({
                action: action,
                callback: callbackName
            });
            
            // Para datos complejos, usar JSON
            if (Object.keys(data).length > 0) {
                params.set('data', JSON.stringify(data));
            }
            
            // Crear script tag para JSONP
            const script = document.createElement('script');
            const url = `${SCRIPT_URL}?${params.toString()}`;
            
            // Definir callback global
            window[callbackName] = function(response) {
                // Limpiar
                delete window[callbackName];
                document.body.removeChild(script);
                
                // Resolver promesa
                resolve(response);
            };
            
            // Manejar errores
            script.onerror = function() {
                delete window[callbackName];
                document.body.removeChild(script);
                showToast('Error de conexión con el servidor', 'error');
                reject(new Error('Error al cargar script'));
            };
            
            // Agregar script al DOM
            script.src = url;
            document.body.appendChild(script);
            
        } catch (error) {
            console.error('Error al comunicarse con Google Sheets:', error);
            showToast('Error de conexión con el servidor', 'error');
            reject(error);
        }
    });
}

async function loadCategories() {
    const result = await fetchData('getCategories');
    if (result && result.success) {
        state.categories = result.data;
    }
}

async function loadProducts() {
    const result = await fetchData('getProducts');
    if (result && result.success) {
        state.products = result.data;
    }
}

// ===================================
// RENDERIZADO DE PRODUCTOS
// ===================================

function renderProducts() {
    const grid = document.getElementById('productsGrid');
    const filteredProducts = state.selectedCategory === 'all' 
        ? state.products 
        : state.products.filter(p => p.category === state.selectedCategory);
    
    if (filteredProducts.length === 0) {
        grid.innerHTML = '<div class="empty-cart"><p>📦</p><span>No hay productos disponibles</span></div>';
        return;
    }
    
    grid.innerHTML = filteredProducts.map(product => `
        <div class="product-card" onclick="addToCart('${product.id}')">
            <h3>${product.name}</h3>
            <div class="product-price">${formatPrice(product.price)}</div>
            ${product.description ? `<p class="product-description">${product.description}</p>` : ''}
        </div>
    `).join('');
}

function renderCategoryFilters() {
    const filterContainer = document.getElementById('categoryFilter');
    
    const buttons = [
        '<button class="category-btn active" data-category="all">Todos</button>',
        ...state.categories.map(cat => 
            `<button class="category-btn" data-category="${cat.name}">${cat.name}</button>`
        )
    ].join('');
    
    filterContainer.innerHTML = buttons;
}

function filterByCategory(category) {
    state.selectedCategory = category;
    
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-category="${category}"]`).classList.add('active');
    
    renderProducts();
}

// ===================================
// GESTIÓN DEL CARRITO
// ===================================

function addToCart(productId) {
    const product = state.products.find(p => p.id === productId);
    if (!product) return;
    
    // Guardar producto temporal y abrir modal de notas
    state.tempProduct = { ...product, quantity: 1, notes: '' };
    openNotesModal(product);
}

function confirmNotes() {
    const notes = document.getElementById('productNotes').value.trim();
    state.tempProduct.notes = notes;
    
    // Verificar si el producto ya está en el carrito (mismo producto y mismas notas)
    const existingItem = state.cart.find(
        item => item.id === state.tempProduct.id && item.notes === notes
    );
    
    if (existingItem) {
        existingItem.quantity++;
    } else {
        state.cart.push({ ...state.tempProduct });
    }
    
    renderCart();
    closeModal('modalNotes');
    document.getElementById('productNotes').value = '';
    showToast('Producto agregado al carrito', 'success');
}

function updateQuantity(index, change) {
    const item = state.cart[index];
    item.quantity += change;
    
    if (item.quantity <= 0) {
        removeFromCart(index);
    } else {
        renderCart();
    }
}

function removeFromCart(index) {
    state.cart.splice(index, 1);
    renderCart();
    showToast('Producto eliminado', 'success');
}

function clearCart() {
    if (state.cart.length === 0) return;
    
    if (confirm('¿Estás seguro de limpiar el carrito?')) {
        state.cart = [];
        renderCart();
        showToast('Carrito limpiado', 'success');
    }
}

function renderCart() {
    const cartContainer = document.getElementById('cartItems');
    const totalElement = document.getElementById('totalAmount');
    
    if (state.cart.length === 0) {
        cartContainer.innerHTML = `
            <div class="empty-cart">
                <p>🛒</p>
                <span>Carrito vacío</span>
            </div>
        `;
        totalElement.textContent = '$0';
        return;
    }
    
    cartContainer.innerHTML = state.cart.map((item, index) => `
        <div class="cart-item">
            <div class="cart-item-header">
                <span class="cart-item-name">${item.name}</span>
                <button class="cart-item-remove" onclick="removeFromCart(${index})">×</button>
            </div>
            ${item.notes ? `<div class="cart-item-notes">📝 ${item.notes}</div>` : ''}
            <div class="cart-item-footer">
                <div class="quantity-controls">
                    <button class="qty-btn" onclick="updateQuantity(${index}, -1)">-</button>
                    <span class="qty-display">${item.quantity}</span>
                    <button class="qty-btn" onclick="updateQuantity(${index}, 1)">+</button>
                </div>
                <span class="cart-item-price">${formatPrice(item.price * item.quantity)}</span>
            </div>
        </div>
    `).join('');
    
    const total = calculateTotal();
    totalElement.textContent = formatPrice(total);
}

function calculateTotal() {
    return state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
}

// ===================================
// PROCESAR ORDEN
// ===================================

async function processOrder() {
    const customerName = document.getElementById('customerName').value.trim();
    const orderType = document.querySelector('input[name="orderType"]:checked').value;
    
    // Validaciones
    if (!customerName) {
        showToast('Por favor ingrese el nombre del cliente', 'error');
        document.getElementById('customerName').focus();
        return;
    }
    
    if (state.cart.length === 0) {
        showToast('El carrito está vacío', 'error');
        return;
    }
    
    showLoader(true);
    
    // Preparar datos de la orden
    const orderData = {
        customerName,
        orderType,
        items: state.cart,
        total: calculateTotal(),
        date: new Date().toISOString()
    };
    
    // Enviar a Google Sheets
    const result = await fetchData('createOrder', orderData);
    
    if (result && result.success) {
        // Imprimir facturas
        await printReceipts(result.orderNumber, orderData);
        
        // Limpiar carrito y formulario
        state.cart = [];
        document.getElementById('customerName').value = '';
        document.querySelector('input[name="orderType"][value="local"]').checked = true;
        renderCart();
        
        showToast(`Orden #${result.orderNumber} procesada correctamente`, 'success');
    } else {
        showToast('Error al procesar la orden', 'error');
    }
    
    showLoader(false);
}

// ===================================
// SISTEMA DE IMPRESIÓN
// ===================================

async function printReceipts(orderNumber, orderData) {
    // Generar contenido de la factura
    const receiptContent = generateReceiptContent(orderNumber, orderData);
    
    // Configurar número de copias y sus nombres
    const copies = [
        'CLIENTE',  // Primera copia
        'COCINA'    // Segunda copia
        // Agrega más si necesitas: 'CAJA', 'MESERO', etc.
    ];
    
    // Imprimir cada copia
    for (let i = 0; i < copies.length; i++) {
        await printToThermalPrinter(receiptContent, copies[i]);
    }
}

function generateReceiptContent(orderNumber, orderData) {
    const { customerName, orderType, items, total, date } = orderData;
    const now = new Date(date);
    const formattedDate = now.toLocaleDateString('es-CO', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
    });
    const formattedTime = now.toLocaleTimeString('es-CO', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
    });
    
    // Función para centrar texto (40 caracteres)
    const center = (text) => {
        const len = text.length;
        const padding = Math.max(0, Math.floor((40 - len) / 2));
        return ' '.repeat(padding) + text;
    };
    
    let content = `
${center('CHARLIE FAST FOOD')}
${'='.repeat(40)}
CLL 5A #1 C SUR - 48, Bellavista
Tel: 324 2749206
@charliefastfood
${'='.repeat(40)}

Factura: ${String(orderNumber).padStart(3, '0')}
Fecha: ${formattedDate}  ${formattedTime}
Cliente: ${customerName}
Tipo: ${orderType.toUpperCase()}

${'='.repeat(40)}
PRODUCTOS
${'='.repeat(40)}

`;
    
    items.forEach(item => {
        // Nombre del producto
        content += `${item.name}\n`;
        
        // Cantidad x Precio = Subtotal
        const qtyPrice = `${item.quantity} x ${formatPrice(item.price)}`;
        const subtotal = formatPrice(item.price * item.quantity);
        const spaces = 40 - qtyPrice.length - subtotal.length;
        content += `${qtyPrice}${' '.repeat(spaces)}${subtotal}\n`;
        
        // Notas si existen
        if (item.notes) {
            // Dividir notas en líneas de máximo 36 caracteres
            const noteLines = item.notes.match(/.{1,36}/g) || [item.notes];
            noteLines.forEach(line => {
                content += `  * ${line}\n`;
            });
        }
        content += `\n`;
    });
    
    content += `${'='.repeat(40)}\n`;
    content += `TOTAL:${' '.repeat(34 - formatPrice(total).length)}${formatPrice(total)}\n`;
    content += `${'='.repeat(40)}\n\n`;
    content += `${center('¡Gracias por su compra!')}\n`;
    content += `${center('Vuelve pronto')}\n\n\n`;
    
    return content;
}

async function printToThermalPrinter(content, copy) {
    try {
        // Agregar encabezado de copia
        const fullContent = `\n${copy}\n${'-'.repeat(40)}\n${content}`;
        
        // Abrir ventana de impresión
        const printWindow = window.open('', '_blank', 'width=300,height=600');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Factura - ${copy}</title>
                <style>
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    
                    @page {
                        size: 80mm auto;
                        margin: 0;
                    }
                    
                    body {
                        font-family: 'Courier New', monospace;
                        font-size: 11px;
                        width: 80mm;
                        margin: 0 auto;
                        padding: 5mm;
                        background: white;
                        color: black;
                    }
                    
                    pre {
                        font-family: 'Courier New', monospace;
                        font-size: 11px;
                        white-space: pre-wrap;
                        word-wrap: break-word;
                        margin: 0;
                        line-height: 1.3;
                    }
                    
                    @media print {
                        body {
                            width: 80mm;
                            padding: 2mm;
                        }
                        
                        pre {
                            font-size: 10px;
                        }
                    }
                    
                    @media screen {
                        body {
                            box-shadow: 0 0 10px rgba(0,0,0,0.1);
                            margin-top: 10px;
                        }
                    }
                </style>
            </head>
            <body>
                <pre>${fullContent}</pre>
                <script>
                    window.onload = function() {
                        setTimeout(function() {
                            window.print();
                            // Cerrar después de imprimir o cancelar
                            setTimeout(function() {
                                window.close();
                            }, 100);
                        }, 500);
                    }
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
        
    } catch (error) {
        console.error('Error al imprimir:', error);
        showToast('Error al imprimir la factura', 'error');
    }
}

// ===================================
// ADMINISTRACIÓN - PRODUCTOS
// ===================================

async function loadAdminData() {
    showLoader(true);
    await loadProducts();
    await loadCategories();
    renderProductsTable();
    renderCategoriesGrid();
    updateCategorySelects();
    showLoader(false);
}

function renderProductsTable() {
    const tbody = document.getElementById('productsTableBody');
    
    if (state.products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay productos registrados</td></tr>';
        return;
    }
    
    tbody.innerHTML = state.products.map(product => `
        <tr>
            <td>${product.name}</td>
            <td>${product.category}</td>
            <td>${formatPrice(product.price)}</td>
            <td>${product.description || '-'}</td>
            <td>
                <div class="action-btns">
                    <button class="btn-edit" onclick="editProduct('${product.id}')">Editar</button>
                    <button class="btn-delete" onclick="deleteProduct('${product.id}')">Eliminar</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function openProductModal(productId = null) {
    const modal = document.getElementById('modalProduct');
    const title = document.getElementById('modalProductTitle');
    const form = document.getElementById('formProduct');
    
    form.reset();
    updateCategorySelects();
    
    if (productId) {
        const product = state.products.find(p => p.id === productId);
        if (product) {
            title.textContent = 'Editar Producto';
            document.getElementById('productId').value = product.id;
            document.getElementById('productName').value = product.name;
            document.getElementById('productCategory').value = product.category;
            document.getElementById('productPrice').value = product.price;
            document.getElementById('productDescription').value = product.description || '';
        }
    } else {
        title.textContent = 'Nuevo Producto';
        document.getElementById('productId').value = '';
    }
    
    openModal('modalProduct');
}

function editProduct(productId) {
    openProductModal(productId);
}

async function deleteProduct(productId) {
    if (!confirm('¿Estás seguro de eliminar este producto?')) return;
    
    showLoader(true);
    const result = await fetchData('deleteProduct', { id: productId });
    
    if (result && result.success) {
        await loadProducts();
        renderProductsTable();
        renderProducts();
        showToast('Producto eliminado correctamente', 'success');
    } else {
        showToast('Error al eliminar el producto', 'error');
    }
    
    showLoader(false);
}

async function saveProduct(e) {
    e.preventDefault();
    
    const productData = {
        id: document.getElementById('productId').value,
        name: document.getElementById('productName').value.trim(),
        category: document.getElementById('productCategory').value,
        price: parseInt(document.getElementById('productPrice').value),
        description: document.getElementById('productDescription').value.trim()
    };
    
    showLoader(true);
    const action = productData.id ? 'updateProduct' : 'createProduct';
    const result = await fetchData(action, productData);
    
    if (result && result.success) {
        await loadProducts();
        renderProductsTable();
        renderProducts();
        renderCategoryFilters();
        closeModal('modalProduct');
        showToast(
            productData.id ? 'Producto actualizado correctamente' : 'Producto creado correctamente',
            'success'
        );
    } else {
        showToast('Error al guardar el producto', 'error');
    }
    
    showLoader(false);
}

// ===================================
// ADMINISTRACIÓN - CATEGORÍAS
// ===================================

function renderCategoriesGrid() {
    const grid = document.getElementById('categoriesGrid');
    
    if (state.categories.length === 0) {
        grid.innerHTML = '<div class="empty-cart"><p>📁</p><span>No hay categorías registradas</span></div>';
        return;
    }
    
    grid.innerHTML = state.categories.map(category => `
        <div class="category-card">
            <h3>${category.name}</h3>
            <div class="action-btns">
                <button class="btn-edit" onclick="editCategory('${category.id}')">Editar</button>
                <button class="btn-delete" onclick="deleteCategory('${category.id}')">Eliminar</button>
            </div>
        </div>
    `).join('');
}

function openCategoryModal(categoryId = null) {
    const modal = document.getElementById('modalCategory');
    const title = document.getElementById('modalCategoryTitle');
    const form = document.getElementById('formCategory');
    
    form.reset();
    
    if (categoryId) {
        const category = state.categories.find(c => c.id === categoryId);
        if (category) {
            title.textContent = 'Editar Categoría';
            document.getElementById('categoryId').value = category.id;
            document.getElementById('categoryName').value = category.name;
        }
    } else {
        title.textContent = 'Nueva Categoría';
        document.getElementById('categoryId').value = '';
    }
    
    openModal('modalCategory');
}

function editCategory(categoryId) {
    openCategoryModal(categoryId);
}

async function deleteCategory(categoryId) {
    // Verificar si hay productos con esta categoría
    const hasProducts = state.products.some(p => p.category === state.categories.find(c => c.id === categoryId)?.name);
    
    if (hasProducts) {
        showToast('No se puede eliminar una categoría con productos asociados', 'error');
        return;
    }
    
    if (!confirm('¿Estás seguro de eliminar esta categoría?')) return;
    
    showLoader(true);
    const result = await fetchData('deleteCategory', { id: categoryId });
    
    if (result && result.success) {
        await loadCategories();
        renderCategoriesGrid();
        renderCategoryFilters();
        updateCategorySelects();
        showToast('Categoría eliminada correctamente', 'success');
    } else {
        showToast('Error al eliminar la categoría', 'error');
    }
    
    showLoader(false);
}

async function saveCategory(e) {
    e.preventDefault();
    
    const categoryData = {
        id: document.getElementById('categoryId').value,
        name: document.getElementById('categoryName').value.trim()
    };
    
    showLoader(true);
    const action = categoryData.id ? 'updateCategory' : 'createCategory';
    const result = await fetchData(action, categoryData);
    
    if (result && result.success) {
        await loadCategories();
        renderCategoriesGrid();
        renderCategoryFilters();
        updateCategorySelects();
        closeModal('modalCategory');
        showToast(
            categoryData.id ? 'Categoría actualizada correctamente' : 'Categoría creada correctamente',
            'success'
        );
    } else {
        showToast('Error al guardar la categoría', 'error');
    }
    
    showLoader(false);
}

function updateCategorySelects() {
    const select = document.getElementById('productCategory');
    select.innerHTML = '<option value="">Seleccione una categoría</option>' +
        state.categories.map(cat => `<option value="${cat.name}">${cat.name}</option>`).join('');
}

// ===================================
// UTILIDADES
// ===================================

function formatPrice(price) {
    return '$' + price.toLocaleString('es-CO');
}

function showLoader(show) {
    const loader = document.getElementById('loader');
    if (show) {
        loader.classList.add('active');
    } else {
        loader.classList.remove('active');
    }
}

function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function openNotesModal(product) {
    document.getElementById('notesProductName').textContent = product.name;
    document.getElementById('productNotes').value = '';
    openModal('modalNotes');
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? '✓' : '✕';
    
    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Cerrar modales al hacer clic fuera
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('active');
    }
}