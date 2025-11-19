// Configuration
// Backend API base URL:
// - Local development: http://localhost:5000/api
// - Production (Render): https://paws-and-tails-backend.onrender.com/api
const isLocalhost = window.location.hostname === 'localhost' || 
                    window.location.hostname === '127.0.0.1' ||
                    window.location.hostname === '';
const API_BASE_URL = isLocalhost
    ? 'https://b-1029-wuca.onrender.com/api/products'
    : 'https://b-1029-wuca.onrender.com/api/products';

// Helpful links (update these after deployment)
const GITHUB_REPO_URL = 'https://github.com/Klouno123/paws-and-tails.git';
const RENDER_SERVICE_URL = 'https://b-1029-wuca.onrender.com/api/products';
const NETLIFY_SITE_URL = 'ladjabuteam.netlify.app';

// Product data (loaded from API)
let products = [];

// Cart functionality
let cart = JSON.parse(localStorage.getItem('cart')) || [];
let currentUser = JSON.parse(localStorage.getItem('currentUser')) || null;
let authToken = localStorage.getItem('authToken') || null;
let isAdmin = false;
let selectedShippingMethod = 'standard';
let selectedPaymentMethod = 'card';
let selectedLoginRole = 'User'; // Track selected login role (User or Admin)

// Helper function to get auth token
function getAuthToken() {
    return localStorage.getItem('authToken');
}

// Helper function to make authenticated API requests
async function apiRequest(url, options = {}) {
    const token = getAuthToken();
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(url, {
        ...options,
        headers
    });
    
    if (response.status === 401) {
        // Token expired or invalid, logout user
        handleLogout();
        throw new Error('Session expired. Please login again.');
    }
    
    return response;
}

// Normalize product data from backend (backend uses _id and imageUrl, frontend uses id and image)
function normalizeProduct(product) {
    // Handle image URL - ensure it's never undefined
    let imageUrl = product.imageUrl || product.image;
    if (!imageUrl || imageUrl === 'undefined' || imageUrl === 'null') {
        imageUrl = 'https://via.placeholder.com/400x300?text=No+Image';
    }
    
    return {
        id: product._id || product.id,
        name: product.name || 'Unnamed Product',
        price: product.price || 0,
        image: imageUrl,
        description: product.description || 'No description available',
        category: product.category || 'General',
        stock: product.stock !== undefined ? product.stock : 10 // Default stock if not provided
    };
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // Global image error handler to prevent undefined image errors
    document.addEventListener('error', function(e) {
        if (e.target.tagName === 'IMG') {
            const img = e.target;
            if (!img.src || img.src.includes('undefined') || img.src.includes('null')) {
                img.src = 'https://via.placeholder.com/400x300?text=No+Image';
                img.onerror = null; // Prevent infinite loop
            }
        }
    }, true);
    
    // Restore user session if token exists
    if (authToken && currentUser) {
        isAdmin = currentUser.isAdmin === true;
    } else {
        // Clear invalid session
        currentUser = null;
        authToken = null;
        isAdmin = false;
    }
    
    // Initialize role selector to User by default
    if (document.getElementById('role-user-btn')) {
        selectLoginRole('User');
    }
    
    renderProducts();
    updateCartUI();
    updateAccountUI();
    updateAdminDashboard();
    loadProductsFromAPI();
    
    // Card number formatting
    document.getElementById('card-number').addEventListener('input', function(e) {
        let value = e.target.value.replace(/\s/g, '');
        let formattedValue = value.match(/.{1,4}/g)?.join(' ') || value;
        e.target.value = formattedValue;
    });
    
    // Expiry date formatting
    document.getElementById('card-expiry').addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length >= 2) {
            value = value.slice(0, 2) + '/' + value.slice(2, 4);
        }
        e.target.value = value;
    });
    
    // CVV formatting
    document.getElementById('card-cvv').addEventListener('input', function(e) {
        e.target.value = e.target.value.replace(/\D/g, '');
    });
});

// API Functions
async function loadProductsFromAPI() {
    try {
        const response = await fetch(`${API_BASE_URL}/products`);
        if (response.ok) {
            const backendProducts = await response.json();
            // Normalize all products to ensure no undefined values
            products = backendProducts.map(product => normalizeProduct(product));
            renderProducts();
            updateAdminDashboard();
        } else {
            console.error('Failed to load products:', response.statusText);
            // Fallback to localStorage
            const storedProducts = localStorage.getItem('products');
            if (storedProducts) {
                const parsed = JSON.parse(storedProducts);
                // Normalize stored products too
                products = parsed.map(product => normalizeProduct(product));
                renderProducts();
                updateAdminDashboard();
            }
        }
    } catch (error) {
        console.error('Error loading products:', error);
        if (error.message && error.message.includes('Failed to fetch')) {
            console.warn('Backend server may not be running. Please start the backend server on port 5000.');
            showNotification('⚠️ Cannot connect to backend. Make sure the server is running on port 5000.');
        }
        // Fallback to localStorage
        const storedProducts = localStorage.getItem('products');
        if (storedProducts) {
            const parsed = JSON.parse(storedProducts);
            // Normalize stored products too
            products = parsed.map(product => normalizeProduct(product));
            renderProducts();
            updateAdminDashboard();
        }
    }
}

// Save product with file upload
async function saveProductWithFile(product, imageFile, productId) {
    if (!isAdmin) {
        showNotification('Admin access required! 🔐');
        return;
    }
    
    try {
        const method = productId ? 'PUT' : 'POST';
        const url = productId ? `${API_BASE_URL}/products/${productId}` : `${API_BASE_URL}/products`;
        
        // Create FormData for file upload
        const formData = new FormData();
        formData.append('name', product.name);
        formData.append('description', product.description);
        formData.append('price', product.price);
        formData.append('image', imageFile);
        
        const token = getAuthToken();
        const headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        // Don't set Content-Type for FormData - browser will set it with boundary
        
        const response = await fetch(url, {
            method: method,
            headers: headers,
            body: formData
        });
        
        if (response.ok) {
            const result = await response.json();
            const savedProduct = normalizeProduct(result.product || result);
            
            // Reload all products from backend to ensure we have the latest data
            await loadProductsFromAPI();
            
            showNotification('Product saved to database successfully! ✅');
        } else {
            const error = await response.json();
            throw new Error(error.message || 'Failed to save product');
        }
    } catch (error) {
        console.error('Error saving product:', error);
        showNotification(`Error: ${error.message} ❌`);
    }
}

async function saveProductToAPI(product) {
    if (!isAdmin) {
        showNotification('Admin access required! 🔐');
        return;
    }
    
    try {
        const method = product.id ? 'PUT' : 'POST';
        const url = product.id ? `${API_BASE_URL}/products/${product.id}` : `${API_BASE_URL}/products`;
        
        // Prepare product data for backend (backend expects name, description, price, imageUrl)
        const productData = {
            name: product.name,
            description: product.description,
            price: product.price,
            imageUrl: product.image || product.imageUrl
        };
        
        const response = await apiRequest(url, {
            method: method,
            body: JSON.stringify(productData)
        });
        
        if (response.ok) {
            const result = await response.json();
            const savedProduct = normalizeProduct(result.product || result);
            
            // Reload all products from backend to ensure we have the latest data
            await loadProductsFromAPI();
            
            showNotification('Product saved to database successfully! ✅');
        } else {
            const error = await response.json();
            throw new Error(error.message || 'Failed to save product');
        }
    } catch (error) {
        console.error('Error saving product:', error);
        showNotification(`Error: ${error.message} ❌`);
    }
}

async function deleteProductFromAPI(productId) {
    if (!isAdmin) {
        showNotification('Admin access required! 🔐');
        return;
    }
    
    try {
        const response = await apiRequest(`${API_BASE_URL}/products/${productId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            // Reload all products from backend to ensure we have the latest data
            await loadProductsFromAPI();
            showNotification('Product deleted from database successfully! ✅');
        } else {
            const error = await response.json();
            throw new Error(error.message || 'Failed to delete product');
        }
    } catch (error) {
        console.error('Error deleting product:', error);
        showNotification(`Error: ${error.message} ❌`);
    }
}

function renderProducts() {
    const grid = document.getElementById('product-grid');
    grid.innerHTML = products.map(product => {
        const isOutOfStock = product.stock === 0;
        const stockClass = product.stock <= 5 ? 'text-red-500' : product.stock <= 10 ? 'text-yellow-500' : 'text-green-500';
        
        // Ensure image URL is never undefined
        const productImage = product.image && product.image !== 'undefined' && product.image !== 'null' 
            ? product.image 
            : 'https://via.placeholder.com/400x300?text=No+Image';
        
        return `
            <div class="bg-white rounded-2xl shadow-lg overflow-hidden card-hover ${isOutOfStock ? 'opacity-75' : ''}">
                <img src="${productImage}" alt="${product.name || 'Product'}" class="w-full product-image" onerror="this.src='https://via.placeholder.com/400x300?text=No+Image'">
                <div class="p-6">
                    <div class="text-sm text-orange-500 font-semibold mb-2">${product.category}</div>
                    <h3 class="text-xl font-bold text-gray-800 mb-2">${product.name}</h3>
                    <p class="text-gray-600 mb-4">${product.description}</p>
                    <div class="mb-4">
                        <span class="text-sm font-semibold ${stockClass}">
                            ${isOutOfStock ? '🚫 Out of Stock' : `📦 ${product.stock} in stock`}
                        </span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-2xl font-bold text-orange-500">$${product.price.toFixed(2)}</span>
                        <button 
                            onclick="addToCart('${product.id}')" 
                            class="bg-gradient-to-r ${isOutOfStock ? 'from-gray-400 to-gray-500 cursor-not-allowed' : 'from-orange-400 to-pink-400 hover:shadow-lg'} text-white px-6 py-2 rounded-full font-semibold transition transform hover:scale-105"
                            ${isOutOfStock ? 'disabled' : ''}>
                            ${isOutOfStock ? 'Out of Stock' : 'Add to Cart'}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    if (isAdmin) {
        renderAdminProducts();
    }
}

function renderAdminProducts() {
    const adminGrid = document.getElementById('admin-products-grid');
    adminGrid.innerHTML = products.map(product => {
        const stockClass = product.stock === 0 ? 'text-red-600' : product.stock <= 5 ? 'text-yellow-600' : 'text-green-600';
        
        // Ensure image URL is never undefined
        const productImage = product.image && product.image !== 'undefined' && product.image !== 'null' 
            ? product.image 
            : 'https://via.placeholder.com/400x300?text=No+Image';
        
        return `
            <div class="bg-white rounded-xl shadow-md overflow-hidden border border-gray-200">
                <img src="${productImage}" alt="${product.name || 'Product'}" class="w-full h-32 object-cover" onerror="this.src='https://via.placeholder.com/400x300?text=No+Image'">
                <div class="p-4">
                    <h4 class="font-bold text-gray-800 mb-2">${product.name}</h4>
                    <p class="text-sm text-gray-600 mb-2">${product.category} - $${product.price}</p>
                    <p class="text-sm font-semibold ${stockClass} mb-3">
                        Stock: ${product.stock} units
                    </p>
                    <div class="flex gap-2 mb-3">
                        <button onclick="updateStock('${product.id}', -10)" class="bg-orange-500 text-white px-2 py-1 rounded text-xs hover:bg-orange-600 transition">
                            -10
                        </button>
                        <button onclick="updateStock('${product.id}', -1)" class="bg-red-500 text-white px-2 py-1 rounded text-xs hover:bg-red-600 transition">
                            -1
                        </button>
                        <button onclick="updateStock('${product.id}', 1)" class="bg-green-500 text-white px-2 py-1 rounded text-xs hover:bg-green-600 transition">
                            +1
                        </button>
                        <button onclick="updateStock('${product.id}', 10)" class="bg-blue-500 text-white px-2 py-1 rounded text-xs hover:bg-blue-600 transition">
                            +10
                        </button>
                    </div>
                    <div class="flex justify-between">
                        <button onclick="editProduct('${product.id}')" class="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 transition">
                            Edit
                        </button>
                        <button onclick="deleteProduct('${product.id}')" class="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600 transition">
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function addToCart(productId) {
    if (!currentUser) {
        showNotification('Please login to add items to cart! 🔐');
        setTimeout(() => {
            toggleAccount();
        }, 500);
        return;
    }

    const product = products.find(p => String(p.id) === String(productId));
    if (!product) {
        showNotification('Product not found. Please refresh the page. ❌');
        return;
    }
    const existingItem = cart.find(item => String(item.id) === String(productId));
    
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({ ...product, quantity: 1 });
    }
    
    saveCart();
    updateCartUI();
    showNotification(`${product.name} added to cart! 🎉`);
}

function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    saveCart();
    updateCartUI();
    updateCheckoutSummary();
}

function updateQuantity(productId, change) {
    const item = cart.find(item => item.id === productId);
    if (item) {
        item.quantity += change;
        if (item.quantity <= 0) {
            removeFromCart(productId);
        } else {
            saveCart();
            updateCartUI();
            updateCheckoutSummary();
        }
    }
}

function saveCart() {
    localStorage.setItem('cart', JSON.stringify(cart));
}

function updateCartUI() {
    const cartCount = document.getElementById('cart-count');
    const cartItems = document.getElementById('cart-items');
    const cartTotal = document.getElementById('cart-total');
    const totalAmount = document.getElementById('total-amount');
    
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCount.textContent = totalItems;
    
    if (cart.length === 0) {
        cartItems.innerHTML = '<p class="text-gray-500 text-center py-8">Your cart is empty. Time to spoil your pet! 🐾</p>';
        cartTotal.classList.add('hidden');
    } else {
        const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        
        cartItems.innerHTML = cart.map(item => {
            // Ensure image URL is never undefined
            const itemImage = item.image && item.image !== 'undefined' && item.image !== 'null' 
                ? item.image 
                : 'https://via.placeholder.com/80x80?text=No+Image';
            
            return `
            <div class="flex items-center gap-4 mb-4 pb-4 border-b border-gray-200">
                <img src="${itemImage}" alt="${item.name || 'Product'}" class="w-20 h-20 object-cover rounded-lg" onerror="this.src='https://via.placeholder.com/80x80?text=No+Image'">
                <div class="flex-1">
                    <h4 class="font-semibold text-gray-800">${item.name}</h4>
                    <p class="text-orange-500 font-bold">$${item.price.toFixed(2)}</p>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="updateQuantity('${item.id}', -1)" class="bg-gray-200 hover:bg-gray-300 w-8 h-8 rounded-full font-bold">-</button>
                    <span class="w-8 text-center font-semibold">${item.quantity}</span>
                    <button onclick="updateQuantity('${item.id}', 1)" class="bg-gray-200 hover:bg-gray-300 w-8 h-8 rounded-full font-bold">+</button>
                </div>
                <button onclick="removeFromCart('${item.id}')" class="text-red-500 hover:text-red-700 text-xl">🗑️</button>
            </div>
        `;
        }).join('');
        
        totalAmount.textContent = `$${total.toFixed(2)}`;
        cartTotal.classList.remove('hidden');
    }
}

function toggleCart() {
    const modal = document.getElementById('cart-modal');
    modal.classList.toggle('hidden');
}

function proceedToCheckout() {
    if (cart.length === 0) {
        showNotification('Your cart is empty! 🛒');
        return;
    }

    if (currentUser && isAdmin) {
        showNotification('Admins/Owners cannot place orders. Please use a customer account. 🔐');
        return;
    }
    
    toggleCart();
    showCheckout();
}

function showCheckout() {
    document.getElementById('shop-hero').classList.add('hidden');
    document.getElementById('products').classList.add('hidden');
    document.getElementById('admin').classList.add('hidden');
    document.getElementById('about-us').classList.add('hidden');
    document.getElementById('contact-us').classList.add('hidden');
    document.getElementById('checkout-page').classList.remove('hidden');
    
    if (currentUser) {
        document.getElementById('checkout-email').value = currentUser.email;
        const nameParts = currentUser.name.split(' ');
        document.getElementById('checkout-firstname').value = nameParts[0] || '';
        document.getElementById('checkout-lastname').value = nameParts.slice(1).join(' ') || '';
    }
    
    updateCheckoutSummary();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function backToShopping() {
    document.getElementById('checkout-page').classList.add('hidden');
    document.getElementById('shop-hero').classList.remove('hidden');
    document.getElementById('products').classList.remove('hidden');
    document.getElementById('about-us').classList.remove('hidden');
    document.getElementById('contact-us').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateCheckoutSummary() {
    const checkoutItems = document.getElementById('checkout-items');
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    checkoutItems.innerHTML = cart.map(item => {
        // Ensure image URL is never undefined
        const itemImage = item.image && item.image !== 'undefined' && item.image !== 'null' 
            ? item.image 
            : 'https://via.placeholder.com/64x64?text=No+Image';
        
        return `
        <div class="flex items-center gap-3 pb-3 border-b border-gray-200">
            <img src="${itemImage}" alt="${item.name || 'Product'}" class="w-16 h-16 object-cover rounded-lg" onerror="this.src='https://via.placeholder.com/64x64?text=No+Image'">
            <div class="flex-1">
                <h4 class="font-semibold text-sm text-gray-800">${item.name}</h4>
                <p class="text-xs text-gray-600">Qty: ${item.quantity}</p>
            </div>
            <span class="font-bold text-orange-500">$${(item.price * item.quantity).toFixed(2)}</span>
        </div>
    `;
    }).join('');
    
    const shippingCost = selectedShippingMethod === 'standard' ? 0 : 
                       selectedShippingMethod === 'express' ? 12.99 : 24.99;
    const tax = subtotal * 0.08;
    const total = subtotal + shippingCost + tax;
    
    document.getElementById('checkout-subtotal').textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById('checkout-shipping').textContent = shippingCost === 0 ? 'FREE' : `$${shippingCost.toFixed(2)}`;
    document.getElementById('checkout-tax').textContent = `$${tax.toFixed(2)}`;
    document.getElementById('checkout-total').textContent = `$${total.toFixed(2)}`;
}

function selectShipping(method) {
    selectedShippingMethod = method;
    document.querySelectorAll('input[name="shipping"]').forEach(radio => {
        radio.checked = radio.value === method;
        if (radio.checked) {
            radio.closest('.payment-method').classList.add('selected');
        } else {
            radio.closest('.payment-method').classList.remove('selected');
        }
    });
    updateCheckoutSummary();
}

function selectPayment(method) {
    selectedPaymentMethod = method;
    document.querySelectorAll('input[name="payment"]').forEach(radio => {
        radio.checked = radio.value === method;
        if (radio.checked) {
            radio.closest('.payment-method').classList.add('selected');
        } else {
            radio.closest('.payment-method').classList.remove('selected');
        }
    });
    
    document.getElementById('card-details').classList.toggle('hidden', method !== 'card');
    document.getElementById('paypal-message').classList.toggle('hidden', method !== 'paypal');
    document.getElementById('apple-message').classList.toggle('hidden', method !== 'apple');
    document.getElementById('google-message').classList.toggle('hidden', method !== 'google');
}

document.getElementById('checkout-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    if (!currentUser) {
        showNotification('Please login to place an order! 🔐');
        setTimeout(() => {
            toggleAccount();
        }, 500);
        return;
    }
    
    if (selectedPaymentMethod === 'card') {
        const cardNumber = document.getElementById('card-number').value.replace(/\s/g, '');
        const cardName = document.getElementById('card-name').value;
        const cardExpiry = document.getElementById('card-expiry').value;
        const cardCVV = document.getElementById('card-cvv').value;
        
        if (!cardNumber || !cardName || !cardExpiry || !cardCVV) {
            showNotification('Please fill in all card details! ❌');
            return;
        }
        
        if (cardNumber.length < 15) {
            showNotification('Invalid card number! ❌');
            return;
        }
        
        if (cardCVV.length < 3) {
            showNotification('Invalid CVV! ❌');
            return;
        }
    }
    
    // Calculate totals
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const shippingCost = selectedShippingMethod === 'standard' ? 0 : 
                       selectedShippingMethod === 'express' ? 12.99 : 24.99;
    const tax = subtotal * 0.08;
    const total = subtotal + shippingCost + tax;
    
    // Build full address string
    const firstName = document.getElementById('checkout-firstname').value;
    const lastName = document.getElementById('checkout-lastname').value;
    const fullName = `${firstName} ${lastName}`.trim();
    const addressParts = [
        document.getElementById('checkout-address').value,
        document.getElementById('checkout-apartment').value,
        document.getElementById('checkout-city').value,
        document.getElementById('checkout-state').value,
        document.getElementById('checkout-zip').value,
        document.getElementById('checkout-country').value
    ].filter(part => part && part.trim());
    const fullAddress = addressParts.join(', ');
    
    // Prepare order data for backend
    const orderData = {
        name: fullName,
        email: document.getElementById('checkout-email').value,
        phone: document.getElementById('checkout-phone').value,
        address: fullAddress,
        total: total,
        items: cart.map(item => ({
            productId: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity
        }))
    };
    
    try {
        const response = await apiRequest(`${API_BASE_URL}/order/createCheckout`, {
            method: 'POST',
            body: JSON.stringify(orderData)
        });
        
        if (response.ok) {
            const result = await response.json();
            
            // Also save to localStorage for local reference
            const localOrderData = {
                ...orderData,
                customer: {
                    firstName,
                    lastName,
                    email: orderData.email,
                    phone: orderData.phone
                },
                shipping: {
                    address: document.getElementById('checkout-address').value,
                    apartment: document.getElementById('checkout-apartment').value,
                    city: document.getElementById('checkout-city').value,
                    state: document.getElementById('checkout-state').value,
                    zip: document.getElementById('checkout-zip').value,
                    country: document.getElementById('checkout-country').value,
                    method: selectedShippingMethod
                },
                payment: {
                    method: selectedPaymentMethod
                },
                notes: document.getElementById('order-notes').value,
                timestamp: new Date().toISOString()
            };
            
            const orders = JSON.parse(localStorage.getItem('orders')) || [];
            orders.push(localOrderData);
            localStorage.setItem('orders', JSON.stringify(orders));
            
            cart = [];
            saveCart();
            updateCartUI();
            
            showNotification('Order placed successfully! 🎉 Thank you for shopping with us!');
            
            this.reset();
            setTimeout(() => {
                backToShopping();
            }, 2000);
        } else {
            const error = await response.json();
            showNotification(`Order failed: ${error.error || error.message || 'Unknown error'} ❌`);
        }
    } catch (error) {
        console.error('Order error:', error);
        showNotification(`Error placing order: ${error.message} ❌`);
    }
});

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'fixed top-24 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 bounce-in';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(-20px)';
        notification.style.transition = 'all 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

document.getElementById('contact-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const messageDiv = document.getElementById('form-message');
    messageDiv.innerHTML = '<p class="text-green-500 font-semibold">✅ Message sent! We\'ll get back to you soon!</p>';
    this.reset();
    setTimeout(() => {
        messageDiv.innerHTML = '';
    }, 5000);
});

function showAddProduct() {
    if (!isAdmin) {
        showNotification('Admin access required! 🔐');
        return;
    }
    const modal = document.getElementById('product-modal');
    const form = document.getElementById('product-form');
    const title = document.getElementById('product-modal-title');
    
    title.textContent = '➕ Add New Product';
    form.reset();
    document.getElementById('product-id').value = '';
    
    // Reset image inputs - default to URL input
    toggleImageInput('url');
    
    modal.classList.remove('hidden');
}

function editProduct(productId) {
    const product = products.find(p => p.id === productId);
    if (product) {
        const modal = document.getElementById('product-modal');
        const title = document.getElementById('product-modal-title');
        
        title.textContent = '✏️ Edit Product';
        document.getElementById('product-id').value = product.id;
        document.getElementById('product-name').value = product.name;
        document.getElementById('product-price').value = product.price;
        document.getElementById('product-category').value = product.category;
        document.getElementById('product-description').value = product.description;
        document.getElementById('product-image').value = product.image;
        document.getElementById('product-stock').value = product.stock;
        
        modal.classList.remove('hidden');
    }
}

async function updateStock(productId, change) {
    const product = products.find(p => p.id === productId);
    if (product) {
        const newStock = Math.max(0, product.stock + change);
        product.stock = newStock;
        // Save to backend database
        await saveProductToAPI(product);
    }
}

function deleteProduct(productId) {
    if (confirm('Are you sure you want to delete this product?')) {
        deleteProductFromAPI(productId);
    }
}

function closeProductModal() {
    document.getElementById('product-modal').classList.add('hidden');
}

// Toggle between file upload and URL input
function toggleImageInput(mode) {
    const fileInput = document.getElementById('product-image-file');
    const urlInput = document.getElementById('product-image');
    const btnFile = document.getElementById('btn-upload-file');
    const btnUrl = document.getElementById('btn-upload-url');
    
    if (mode === 'file') {
        // Switch to file upload
        fileInput.classList.remove('hidden');
        fileInput.required = true;
        urlInput.classList.add('hidden');
        urlInput.required = false;
        urlInput.value = '';
        btnFile.classList.add('bg-blue-500', 'text-white');
        btnFile.classList.remove('bg-gray-200', 'text-gray-700');
        btnUrl.classList.add('bg-gray-200', 'text-gray-700');
        btnUrl.classList.remove('bg-purple-500', 'text-white');
    } else {
        // Switch to URL input (default)
        urlInput.classList.remove('hidden');
        urlInput.required = true;
        fileInput.classList.add('hidden');
        fileInput.required = false;
        fileInput.value = '';
        btnUrl.classList.add('bg-purple-500', 'text-white');
        btnUrl.classList.remove('bg-gray-200', 'text-gray-700');
        btnFile.classList.add('bg-gray-200', 'text-gray-700');
        btnFile.classList.remove('bg-blue-500', 'text-white');
    }
}

document.getElementById('product-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const productId = document.getElementById('product-id').value ? 
         document.getElementById('product-id').value : null;
    const product = {
        id: productId,
        name: document.getElementById('product-name').value,
        price: parseFloat(document.getElementById('product-price').value),
        category: document.getElementById('product-category').value,
        description: document.getElementById('product-description').value,
        image: document.getElementById('product-image').value,
        stock: parseInt(document.getElementById('product-stock').value) || 0
    };
    
    // Check if file upload is being used
    const fileInput = document.getElementById('product-image-file');
    const imageFile = fileInput.files[0];
    
    if (imageFile) {
        // Use FormData for file upload
        await saveProductWithFile(product, imageFile, productId);
    } else {
        // Use regular JSON for URL
        await saveProductToAPI(product);
    }
    
    closeProductModal();
});

function updateAdminDashboard() {
    if (!isAdmin) return;
    
    const categories = [...new Set(products.map(p => p.category))];
    document.getElementById('total-products').textContent = products.length;
    document.getElementById('total-users').textContent = JSON.parse(localStorage.getItem('users') || '[]').length;
    document.getElementById('total-categories').textContent = categories.length;
}

function exportData() {
    const data = {
        products: products,
        users: JSON.parse(localStorage.getItem('users') || '[]'),
        orders: JSON.parse(localStorage.getItem('orders') || '[]'),
        timestamp: new Date().toISOString()
    };
    
    const dataStr = JSON.stringify(data, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'paws-tails-data.json';
    link.click();
    URL.revokeObjectURL(url);
    
    showNotification('Data exported successfully! 📤');
}

function refreshProducts() {
    loadProductsFromAPI();
    showNotification('Products refreshed! 🔄');
}

function toggleAccount() {
    const modal = document.getElementById('account-modal');
    modal.classList.toggle('hidden');
    updateAccountUI();
}

function showLogin() {
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('signup-form').classList.add('hidden');
    document.getElementById('auth-message').innerHTML = '';
    // Reset to User role by default
    selectLoginRole('User');
}

function showSignup() {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('signup-form').classList.remove('hidden');
    document.getElementById('auth-message').innerHTML = '';
}

// Function to select login role (User or Admin)
function selectLoginRole(role) {
    selectedLoginRole = role;
    const userBtn = document.getElementById('role-user-btn');
    const adminBtn = document.getElementById('role-admin-btn');
    
    if (role === 'User') {
        userBtn.classList.add('border-purple-400', 'bg-purple-50', 'text-purple-700', 'active');
        userBtn.classList.remove('border-gray-300', 'bg-white', 'text-gray-600');
        adminBtn.classList.add('border-gray-300', 'bg-white', 'text-gray-600');
        adminBtn.classList.remove('border-red-400', 'bg-red-50', 'text-red-700', 'active');
    } else {
        adminBtn.classList.add('border-red-400', 'bg-red-50', 'text-red-700', 'active');
        adminBtn.classList.remove('border-gray-300', 'bg-white', 'text-gray-600');
        userBtn.classList.add('border-gray-300', 'bg-white', 'text-gray-600');
        userBtn.classList.remove('border-purple-400', 'bg-purple-50', 'text-purple-700', 'active');
    }
}

// Unified login function that handles both User and Admin login
async function handleUnifiedLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const messageDiv = document.getElementById('auth-message');

    if (!email || !password) {
        messageDiv.innerHTML = '<p class="text-red-500 font-semibold">❌ Please fill in all fields!</p>';
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            // Check if the user's role matches the selected role
            const userRole = data.user.role;
            const expectedRole = selectedLoginRole;
            
            // If Admin was selected, verify the user is actually an Admin
            if (expectedRole === 'Admin' && userRole !== 'Admin') {
                messageDiv.innerHTML = '<p class="text-red-500 font-semibold">❌ This account is not an Admin. Please select "User" role or use an Admin account.</p>';
                return;
            }
            
            // If User was selected but account is Admin, allow it (Admin can login as User)
            // Store token and user info
            authToken = data.token;
            localStorage.setItem('authToken', data.token);
            currentUser = {
                id: data.user.id,
                name: data.user.name,
                email: email,
                isAdmin: userRole === 'Admin'
            };
            isAdmin = userRole === 'Admin';
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            updateAccountUI();
            toggleAccount();
            
            if (isAdmin) {
                showNotification(`Admin access granted, ${data.user.name}! 🛡️`);
            } else {
                showNotification(`Welcome back, ${data.user.name}! 🎉`);
            }
            
            document.getElementById('login-email').value = '';
            document.getElementById('login-password').value = '';
            messageDiv.innerHTML = '';
            
            // Reload products after login
            loadProductsFromAPI();
        } else {
            messageDiv.innerHTML = `<p class="text-red-500 font-semibold">❌ ${data.message || 'Invalid email or password!'}</p>`;
        }
    } catch (error) {
        console.error('Login error:', error);
        if (error.message && error.message.includes('Failed to fetch')) {
            messageDiv.innerHTML = '<p class="text-red-500 font-semibold">❌ Cannot connect to server. Make sure the backend is running on port 5000.</p>';
        } else {
            messageDiv.innerHTML = '<p class="text-red-500 font-semibold">❌ Connection error. Please try again.</p>';
        }
    }
}

// Keep old function names for backward compatibility (if any onclick handlers still reference them)
async function handleLogin() {
    selectLoginRole('User');
    await handleUnifiedLogin();
}

async function handleAdminLogin() {
    selectLoginRole('Admin');
    await handleUnifiedLogin();
}

async function handleSignup() {
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const confirm = document.getElementById('signup-confirm').value;
    const messageDiv = document.getElementById('auth-message');

    if (!name || !email || !password || !confirm) {
        messageDiv.innerHTML = '<p class="text-red-500 font-semibold">❌ Please fill in all fields!</p>';
        return;
    }

    if (password !== confirm) {
        messageDiv.innerHTML = '<p class="text-red-500 font-semibold">❌ Passwords don\'t match!</p>';
        return;
    }

    if (password.length < 6) {
        messageDiv.innerHTML = '<p class="text-red-500 font-semibold">❌ Password must be at least 6 characters!</p>';
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, email, password, role: 'User' })
        });

        const data = await response.json();

        if (response.ok) {
            // Store token and user info
            authToken = data.token;
            localStorage.setItem('authToken', data.token);
            currentUser = {
                id: data.user.id,
                name: data.user.name,
                email: email,
                isAdmin: data.user.role === 'Admin'
            };
            isAdmin = data.user.role === 'Admin';
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            updateAccountUI();
            toggleAccount();
            showNotification(`Welcome to the pack, ${name}! 🎉 Account saved to database!`);
            
            document.getElementById('signup-name').value = '';
            document.getElementById('signup-email').value = '';
            document.getElementById('signup-password').value = '';
            document.getElementById('signup-confirm').value = '';
            messageDiv.innerHTML = '';
            
            // Reload products after signup
            loadProductsFromAPI();
        } else {
            messageDiv.innerHTML = `<p class="text-red-500 font-semibold">❌ ${data.message || 'Registration failed!'}</p>`;
        }
    } catch (error) {
        console.error('Signup error:', error);
        messageDiv.innerHTML = '<p class="text-red-500 font-semibold">❌ Connection error. Please try again.</p>';
    }
}

function handleLogout() {
    currentUser = null;
    isAdmin = false;
    authToken = null;
    localStorage.removeItem('currentUser');
    localStorage.removeItem('authToken');
    updateAccountUI();
    showNotification('Logged out successfully! Come back soon! 👋');
}

function updateAccountUI() {
    const authView = document.getElementById('auth-view');
    const profileView = document.getElementById('profile-view');
    const accountLabel = document.getElementById('account-label');
    const homeHero = document.getElementById('home-hero');
    const shopHero = document.getElementById('shop-hero');
    const productsSection = document.getElementById('products');
    const contactSection = document.getElementById('contact-us');
    const adminSection = document.getElementById('admin');
    const checkoutPage = document.getElementById('checkout-page');
    const body = document.getElementById('body-class');
    const aboutSection = document.getElementById('about-us');

    if (currentUser) {
        authView.classList.add('hidden');
        profileView.classList.remove('hidden');
        document.getElementById('profile-name').textContent = `Welcome, ${currentUser.name}!`;
        document.getElementById('profile-email').textContent = currentUser.email;
        accountLabel.textContent = currentUser.name.split(' ')[0];
        
        homeHero.classList.add('hidden');
        shopHero.classList.remove('hidden');
        productsSection.classList.remove('hidden');
        checkoutPage.classList.add('hidden');
        
        if (isAdmin) {
            adminSection.classList.remove('hidden');
            contactSection.classList.add('hidden');
            if (aboutSection) aboutSection.classList.add('hidden');
            body.classList.add('is-admin');
        } else {
            adminSection.classList.add('hidden');
            contactSection.classList.remove('hidden');
            if (aboutSection) aboutSection.classList.remove('hidden');
            body.classList.remove('is-admin');
        }
    } else {
        authView.classList.remove('hidden');
        profileView.classList.add('hidden');
        accountLabel.textContent = 'Account';
        showLogin();
        
        homeHero.classList.remove('hidden');
        shopHero.classList.add('hidden');
        productsSection.classList.add('hidden');
        contactSection.classList.add('hidden');
        adminSection.classList.add('hidden');
        checkoutPage.classList.add('hidden');
        body.classList.remove('is-admin');
        if (aboutSection) aboutSection.classList.remove('hidden');
    }
}

// Insert store location & embedded map into the Contact Us section.
// NOTE: Verify the GPS coordinates below and replace if you want higher precision.
function insertContactLocation() {
    const contactSection = document.getElementById('contact-us');
    if (!contactSection) return;

    // Avoid inserting twice
    if (document.getElementById('contact-location')) return;

    // Tukuran, Zamboanga del Sur (verify these coords: 7.9499, 123.2431)
    const lat = 7.9499;
    const lng = 123.2431;
    const locationHtml = `
        <div id="contact-location" class="mb-6">
            <h3 class="text-lg font-bold">Our Store</h3>
            <p>Tukuran, Zamboanga del Sur, Philippines</p>
            <p class="text-sm text-gray-600">GPS: ${lat}, ${lng}</p>
            <div class="mt-4 w-full rounded overflow-hidden border">
                <iframe
                    src="https://www.google.com/maps?q=${lat},${lng}&z=15&output=embed"
                    width="100%"
                    height="300"
                    style="border:0;"
                    allowfullscreen=""
                    loading="lazy"
                    referrerpolicy="no-referrer-when-downgrade"
                ></iframe>
            </div>
        </div>
    `;

    const form = contactSection.querySelector('#contact-form');
    if (form) {
        form.insertAdjacentHTML('beforebegin', locationHtml);
    } else {
        contactSection.insertAdjacentHTML('beforeend', locationHtml);
    }
}

// call on load
document.addEventListener('DOMContentLoaded', function() {
    // Global image error handler to prevent undefined image errors
    document.addEventListener('error', function(e) {
        if (e.target.tagName === 'IMG') {
            const img = e.target;
            if (!img.src || img.src.includes('undefined') || img.src.includes('null')) {
                img.src = 'https://via.placeholder.com/400x300?text=No+Image';
                img.onerror = null; // Prevent infinite loop
            }
        }
    }, true);
    
    // Restore user session if token exists
    if (authToken && currentUser) {
        isAdmin = currentUser.isAdmin === true;
    } else {
        // Clear invalid session
        currentUser = null;
        authToken = null;
        isAdmin = false;
    }
    
    // Initialize role selector to User by default
    if (document.getElementById('role-user-btn')) {
        selectLoginRole('User');
    }
    
    renderProducts();
    updateCartUI();
    updateAccountUI();
    updateAdminDashboard();
    loadProductsFromAPI();
    
    // Card number formatting
    document.getElementById('card-number').addEventListener('input', function(e) {
        let value = e.target.value.replace(/\s/g, '');
        let formattedValue = value.match(/.{1,4}/g)?.join(' ') || value;
        e.target.value = formattedValue;
    });
    
    // Expiry date formatting
    document.getElementById('card-expiry').addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length >= 2) {
            value = value.slice(0, 2) + '/' + value.slice(2, 4);
        }
        e.target.value = value;
    });
    
    // CVV formatting
    document.getElementById('card-cvv').addEventListener('input', function(e) {
        e.target.value = e.target.value.replace(/\D/g, '');
    });
    
    insertContactLocation();
});

// API Functions
async function loadProductsFromAPI() {
    try {
        const response = await fetch(`${API_BASE_URL}/products`);
        if (response.ok) {
            const backendProducts = await response.json();
            // Normalize all products to ensure no undefined values
            products = backendProducts.map(product => normalizeProduct(product));
            renderProducts();
            updateAdminDashboard();
        } else {
            console.error('Failed to load products:', response.statusText);
            // Fallback to localStorage
            const storedProducts = localStorage.getItem('products');
            if (storedProducts) {
                const parsed = JSON.parse(storedProducts);
                // Normalize stored products too
                products = parsed.map(product => normalizeProduct(product));
                renderProducts();
                updateAdminDashboard();
            }
        }
    } catch (error) {
        console.error('Error loading products:', error);
        if (error.message && error.message.includes('Failed to fetch')) {
            console.warn('Backend server may not be running. Please start the backend server on port 5000.');
            showNotification('⚠️ Cannot connect to backend. Make sure the server is running on port 5000.');
        }
        // Fallback to localStorage
        const storedProducts = localStorage.getItem('products');
        if (storedProducts) {
            const parsed = JSON.parse(storedProducts);
            // Normalize stored products too
            products = parsed.map(product => normalizeProduct(product));
            renderProducts();
            updateAdminDashboard();
        }
    }
}

// Save product with file upload
async function saveProductWithFile(product, imageFile, productId) {
    if (!isAdmin) {
        showNotification('Admin access required! 🔐');
        return;
    }
    
    try {
        const method = productId ? 'PUT' : 'POST';
        const url = productId ? `${API_BASE_URL}/products/${productId}` : `${API_BASE_URL}/products`;
        
        // Create FormData for file upload
        const formData = new FormData();
        formData.append('name', product.name);
        formData.append('description', product.description);
        formData.append('price', product.price);
        formData.append('image', imageFile);
        
        const token = getAuthToken();
        const headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        // Don't set Content-Type for FormData - browser will set it with boundary
        
        const response = await fetch(url, {
            method: method,
            headers: headers,
            body: formData
        });
        
        if (response.ok) {
            const result = await response.json();
            const savedProduct = normalizeProduct(result.product || result);
            
            // Reload all products from backend to ensure we have the latest data
            await loadProductsFromAPI();
            
            showNotification('Product saved to database successfully! ✅');
        } else {
            const error = await response.json();
            throw new Error(error.message || 'Failed to save product');
        }
    } catch (error) {
        console.error('Error saving product:', error);
        showNotification(`Error: ${error.message} ❌`);
    }
}

async function saveProductToAPI(product) {
    if (!isAdmin) {
        showNotification('Admin access required! 🔐');
        return;
    }
    
    try {
        const method = product.id ? 'PUT' : 'POST';
        const url = product.id ? `${API_BASE_URL}/products/${product.id}` : `${API_BASE_URL}/products`;
        
        // Prepare product data for backend (backend expects name, description, price, imageUrl)
        const productData = {
            name: product.name,
            description: product.description,
            price: product.price,
            imageUrl: product.image || product.imageUrl
        };
        
        const response = await apiRequest(url, {
            method: method,
            body: JSON.stringify(productData)
        });
        
        if (response.ok) {
            const result = await response.json();
            const savedProduct = normalizeProduct(result.product || result);
            
            // Reload all products from backend to ensure we have the latest data
            await loadProductsFromAPI();
            
            showNotification('Product saved to database successfully! ✅');
        } else {
            const error = await response.json();
            throw new Error(error.message || 'Failed to save product');
        }
    } catch (error) {
        console.error('Error saving product:', error);
        showNotification(`Error: ${error.message} ❌`);
    }
}

async function deleteProductFromAPI(productId) {
    if (!isAdmin) {
        showNotification('Admin access required! 🔐');
        return;
    }
    
    try {
        const response = await apiRequest(`${API_BASE_URL}/products/${productId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            // Reload all products from backend to ensure we have the latest data
            await loadProductsFromAPI();
            showNotification('Product deleted from database successfully! ✅');
        } else {
            const error = await response.json();
            throw new Error(error.message || 'Failed to delete product');
        }
    } catch (error) {
        console.error('Error deleting product:', error);
        showNotification(`Error: ${error.message} ❌`);
    }
}

function renderProducts() {
    const grid = document.getElementById('product-grid');
    grid.innerHTML = products.map(product => {
        const isOutOfStock = product.stock === 0;
        const stockClass = product.stock <= 5 ? 'text-red-500' : product.stock <= 10 ? 'text-yellow-500' : 'text-green-500';
        
        // Ensure image URL is never undefined
        const productImage = product.image && product.image !== 'undefined' && product.image !== 'null' 
            ? product.image 
            : 'https://via.placeholder.com/400x300?text=No+Image';
        
        return `
            <div class="bg-white rounded-2xl shadow-lg overflow-hidden card-hover ${isOutOfStock ? 'opacity-75' : ''}">
                <img src="${productImage}" alt="${product.name || 'Product'}" class="w-full product-image" onerror="this.src='https://via.placeholder.com/400x300?text=No+Image'">
                <div class="p-6">
                    <div class="text-sm text-orange-500 font-semibold mb-2">${product.category}</div>
                    <h3 class="text-xl font-bold text-gray-800 mb-2">${product.name}</h3>
                    <p class="text-gray-600 mb-4">${product.description}</p>
                    <div class="mb-4">
                        <span class="text-sm font-semibold ${stockClass}">
                            ${isOutOfStock ? '🚫 Out of Stock' : `📦 ${product.stock} in stock`}
                        </span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-2xl font-bold text-orange-500">$${product.price.toFixed(2)}</span>
                        <button 
                            onclick="addToCart('${product.id}')" 
                            class="bg-gradient-to-r ${isOutOfStock ? 'from-gray-400 to-gray-500 cursor-not-allowed' : 'from-orange-400 to-pink-400 hover:shadow-lg'} text-white px-6 py-2 rounded-full font-semibold transition transform hover:scale-105"
                            ${isOutOfStock ? 'disabled' : ''}>
                            ${isOutOfStock ? 'Out of Stock' : 'Add to Cart'}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    if (isAdmin) {
        renderAdminProducts();
    }
}

function renderAdminProducts() {
    const adminGrid = document.getElementById('admin-products-grid');
    adminGrid.innerHTML = products.map(product => {
        const stockClass = product.stock === 0 ? 'text-red-600' : product.stock <= 5 ? 'text-yellow-600' : 'text-green-600';
        
        // Ensure image URL is never undefined
        const productImage = product.image && product.image !== 'undefined' && product.image !== 'null' 
            ? product.image 
            : 'https://via.placeholder.com/400x300?text=No+Image';
        
        return `
            <div class="bg-white rounded-xl shadow-md overflow-hidden border border-gray-200">
                <img src="${productImage}" alt="${product.name || 'Product'}" class="w-full h-32 object-cover" onerror="this.src='https://via.placeholder.com/400x300?text=No+Image'">
                <div class="p-4">
                    <h4 class="font-bold text-gray-800 mb-2">${product.name}</h4>
                    <p class="text-sm text-gray-600 mb-2">${product.category} - $${product.price}</p>
                    <p class="text-sm font-semibold ${stockClass} mb-3">
                        Stock: ${product.stock} units
                    </p>
                    <div class="flex gap-2 mb-3">
                        <button onclick="updateStock('${product.id}', -10)" class="bg-orange-500 text-white px-2 py-1 rounded text-xs hover:bg-orange-600 transition">
                            -10
                        </button>
                        <button onclick="updateStock('${product.id}', -1)" class="bg-red-500 text-white px-2 py-1 rounded text-xs hover:bg-red-600 transition">
                            -1
                        </button>
                        <button onclick="updateStock('${product.id}', 1)" class="bg-green-500 text-white px-2 py-1 rounded text-xs hover:bg-green-600 transition">
                            +1
                        </button>
                        <button onclick="updateStock('${product.id}', 10)" class="bg-blue-500 text-white px-2 py-1 rounded text-xs hover:bg-blue-600 transition">
                            +10
                        </button>
                    </div>
                    <div class="flex justify-between">
                        <button onclick="editProduct('${product.id}')" class="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 transition">
                            Edit
                        </button>
                        <button onclick="deleteProduct('${product.id}')" class="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600 transition">
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function addToCart(productId) {
    if (!currentUser) {
        showNotification('Please login to add items to cart! 🔐');
        setTimeout(() => {
            toggleAccount();
        }, 500);
        return;
    }

    const product = products.find(p => String(p.id) === String(productId));
    if (!product) {
        showNotification('Product not found. Please refresh the page. ❌');
        return;
    }
    const existingItem = cart.find(item => String(item.id) === String(productId));
    
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({ ...product, quantity: 1 });
    }
    
    saveCart();
    updateCartUI();
    showNotification(`${product.name} added to cart! 🎉`);
}

function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    saveCart();
    updateCartUI();
    updateCheckoutSummary();
}

function updateQuantity(productId, change) {
    const item = cart.find(item => item.id === productId);
    if (item) {
        item.quantity += change;
        if (item.quantity <= 0) {
            removeFromCart(productId);
        } else {
            saveCart();
            updateCartUI();
            updateCheckoutSummary();
        }
    }
}

function saveCart() {
    localStorage.setItem('cart', JSON.stringify(cart));
}

function updateCartUI() {
    const cartCount = document.getElementById('cart-count');
    const cartItems = document.getElementById('cart-items');
    const cartTotal = document.getElementById('cart-total');
    const totalAmount = document.getElementById('total-amount');
    
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCount.textContent = totalItems;
    
    if (cart.length === 0) {
        cartItems.innerHTML = '<p class="text-gray-500 text-center py-8">Your cart is empty. Time to spoil your pet! 🐾</p>';
        cartTotal.classList.add('hidden');
    } else {
        const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        
        cartItems.innerHTML = cart.map(item => {
            // Ensure image URL is never undefined
            const itemImage = item.image && item.image !== 'undefined' && item.image !== 'null' 
                ? item.image 
                : 'https://via.placeholder.com/80x80?text=No+Image';
            
            return `
            <div class="flex items-center gap-4 mb-4 pb-4 border-b border-gray-200">
                <img src="${itemImage}" alt="${item.name || 'Product'}" class="w-20 h-20 object-cover rounded-lg" onerror="this.src='https://via.placeholder.com/80x80?text=No+Image'">
                <div class="flex-1">
                    <h4 class="font-semibold text-gray-800">${item.name}</h4>
                    <p class="text-orange-500 font-bold">$${item.price.toFixed(2)}</p>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="updateQuantity('${item.id}', -1)" class="bg-gray-200 hover:bg-gray-300 w-8 h-8 rounded-full font-bold">-</button>
                    <span class="w-8 text-center font-semibold">${item.quantity}</span>
                    <button onclick="updateQuantity('${item.id}', 1)" class="bg-gray-200 hover:bg-gray-300 w-8 h-8 rounded-full font-bold">+</button>
                </div>
                <button onclick="removeFromCart('${item.id}')" class="text-red-500 hover:text-red-700 text-xl">🗑️</button>
            </div>
        `;
        }).join('');
        
        totalAmount.textContent = `$${total.toFixed(2)}`;
        cartTotal.classList.remove('hidden');
    }
}

function toggleCart() {
    const modal = document.getElementById('cart-modal');
    modal.classList.toggle('hidden');
}

function proceedToCheckout() {
    if (cart.length === 0) {
        showNotification('Your cart is empty! 🛒');
        return;
    }

    if (currentUser && isAdmin) {
        showNotification('Admins/Owners cannot place orders. Please use a customer account. 🔐');
        return;
    }
    
    toggleCart();
    showCheckout();
}

function showCheckout() {
    document.getElementById('shop-hero').classList.add('hidden');
    document.getElementById('products').classList.add('hidden');
    document.getElementById('admin').classList.add('hidden');
    document.getElementById('about-us').classList.add('hidden');
    document.getElementById('contact-us').classList.add('hidden');
    document.getElementById('checkout-page').classList.remove('hidden');
    
    if (currentUser) {
        document.getElementById('checkout-email').value = currentUser.email;
        const nameParts = currentUser.name.split(' ');
        document.getElementById('checkout-firstname').value = nameParts[0] || '';
        document.getElementById('checkout-lastname').value = nameParts.slice(1).join(' ') || '';
    }
    
    updateCheckoutSummary();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function backToShopping() {
    document.getElementById('checkout-page').classList.add('hidden');
    document.getElementById('shop-hero').classList.remove('hidden');
    document.getElementById('products').classList.remove('hidden');
    document.getElementById('about-us').classList.remove('hidden');
    document.getElementById('contact-us').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateCheckoutSummary() {
    const checkoutItems = document.getElementById('checkout-items');
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    checkoutItems.innerHTML = cart.map(item => {
        // Ensure image URL is never undefined
        const itemImage = item.image && item.image !== 'undefined' && item.image !== 'null' 
            ? item.image 
            : 'https://via.placeholder.com/64x64?text=No+Image';
        
        return `
        <div class="flex items-center gap-3 pb-3 border-b border-gray-200">
            <img src="${itemImage}" alt="${item.name || 'Product'}" class="w-16 h-16 object-cover rounded-lg" onerror="this.src='https://via.placeholder.com/64x64?text=No+Image'">
            <div class="flex-1">
                <h4 class="font-semibold text-sm text-gray-800">${item.name}</h4>
                <p class="text-xs text-gray-600">Qty: ${item.quantity}</p>
            </div>
            <span class="font-bold text-orange-500">$${(item.price * item.quantity).toFixed(2)}</span>
        </div>
    `;
    }).join('');
    
    const shippingCost = selectedShippingMethod === 'standard' ? 0 : 
                       selectedShippingMethod === 'express' ? 12.99 : 24.99;
    const tax = subtotal * 0.08;
    const total = subtotal + shippingCost + tax;
    
    document.getElementById('checkout-subtotal').textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById('checkout-shipping').textContent = shippingCost === 0 ? 'FREE' : `$${shippingCost.toFixed(2)}`;
    document.getElementById('checkout-tax').textContent = `$${tax.toFixed(2)}`;
    document.getElementById('checkout-total').textContent = `$${total.toFixed(2)}`;
}

function selectShipping(method) {
    selectedShippingMethod = method;
    document.querySelectorAll('input[name="shipping"]').forEach(radio => {
        radio.checked = radio.value === method;
        if (radio.checked) {
            radio.closest('.payment-method').classList.add('selected');
        } else {
            radio.closest('.payment-method').classList.remove('selected');
        }
    });
    updateCheckoutSummary();
}

function selectPayment(method) {
    selectedPaymentMethod = method;
    document.querySelectorAll('input[name="payment"]').forEach(radio => {
        radio.checked = radio.value === method;
        if (radio.checked) {
            radio.closest('.payment-method').classList.add('selected');
        } else {
            radio.closest('.payment-method').classList.remove('selected');
        }
    });
    
    document.getElementById('card-details').classList.toggle('hidden', method !== 'card');
    document.getElementById('paypal-message').classList.toggle('hidden', method !== 'paypal');
    document.getElementById('apple-message').classList.toggle('hidden', method !== 'apple');
    document.getElementById('google-message').classList.toggle('hidden', method !== 'google');
}

document.getElementById('checkout-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    if (!currentUser) {
        showNotification('Please login to place an order! 🔐');
        setTimeout(() => {
            toggleAccount();
        }, 500);
        return;
    }
    
    if (selectedPaymentMethod === 'card') {
        const cardNumber = document.getElementById('card-number').value.replace(/\s/g, '');
        const cardName = document.getElementById('card-name').value;
        const cardExpiry = document.getElementById('card-expiry').value;
        const cardCVV = document.getElementById('card-cvv').value;
        
        if (!cardNumber || !cardName || !cardExpiry || !cardCVV) {
            showNotification('Please fill in all card details! ❌');
            return;
        }
        
        if (cardNumber.length < 15) {
            showNotification('Invalid card number! ❌');
            return;
        }
        
        if (cardCVV.length < 3) {
            showNotification('Invalid CVV! ❌');
            return;
        }
    }
    
    // Calculate totals
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const shippingCost = selectedShippingMethod === 'standard' ? 0 : 
                       selectedShippingMethod === 'express' ? 12.99 : 24.99;
    const tax = subtotal * 0.08;
    const total = subtotal + shippingCost + tax;
    
    // Build full address string
    const firstName = document.getElementById('checkout-firstname').value;
    const lastName = document.getElementById('checkout-lastname').value;
    const fullName = `${firstName} ${lastName}`.trim();
    const addressParts = [
        document.getElementById('checkout-address').value,
        document.getElementById('checkout-apartment').value,
        document.getElementById('checkout-city').value,
        document.getElementById('checkout-state').value,
        document.getElementById('checkout-zip').value,
        document.getElementById('checkout-country').value
    ].filter(part => part && part.trim());
    const fullAddress = addressParts.join(', ');
    
    // Prepare order data for backend
    const orderData = {
        name: fullName,
        email: document.getElementById('checkout-email').value,
        phone: document.getElementById('checkout-phone').value,
        address: fullAddress,
        total: total,
        items: cart.map(item => ({
            productId: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity
        }))
    };
    
    try {
        const response = await apiRequest(`${API_BASE_URL}/order/createCheckout`, {
            method: 'POST',
            body: JSON.stringify(orderData)
        });
        
        if (response.ok) {
            const result = await response.json();
            
            // Also save to localStorage for local reference
            const localOrderData = {
                ...orderData,
                customer: {
                    firstName,
                    lastName,
                    email: orderData.email,
                    phone: orderData.phone
                },
                shipping: {
                    address: document.getElementById('checkout-address').value,
                    apartment: document.getElementById('checkout-apartment').value,
                    city: document.getElementById('checkout-city').value,
                    state: document.getElementById('checkout-state').value,
                    zip: document.getElementById('checkout-zip').value,
                    country: document.getElementById('checkout-country').value,
                    method: selectedShippingMethod
                },
                payment: {
                    method: selectedPaymentMethod
                },
                notes: document.getElementById('order-notes').value,
                timestamp: new Date().toISOString()
            };
            
            const orders = JSON.parse(localStorage.getItem('orders')) || [];
            orders.push(localOrderData);
            localStorage.setItem('orders', JSON.stringify(orders));
            
            cart = [];
            saveCart();
            updateCartUI();
            
            showNotification('Order placed successfully! 🎉 Thank you for shopping with us!');
            
            this.reset();
            setTimeout(() => {
                backToShopping();
            }, 2000);
        } else {
            const error = await response.json();
            showNotification(`Order failed: ${error.error || error.message || 'Unknown error'} ❌`);
        }
    } catch (error) {
        console.error('Order error:', error);
        showNotification(`Error placing order: ${error.message} ❌`);
    }
});

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'fixed top-24 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 bounce-in';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(-20px)';
        notification.style.transition = 'all 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

document.getElementById('contact-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const messageDiv = document.getElementById('form-message');
    messageDiv.innerHTML = '<p class="text-green-500 font-semibold">✅ Message sent! We\'ll get back to you soon!</p>';
    this.reset();
    setTimeout(() => {
        messageDiv.innerHTML = '';
    }, 5000);
});

function showAddProduct() {
    if (!isAdmin) {
        showNotification('Admin access required! 🔐');
        return;
    }
    const modal = document.getElementById('product-modal');
    const form = document.getElementById('product-form');
    const title = document.getElementById('product-modal-title');
    
    title.textContent = '➕ Add New Product';
    form.reset();
    document.getElementById('product-id').value = '';
    modal.classList.remove('hidden');
}       