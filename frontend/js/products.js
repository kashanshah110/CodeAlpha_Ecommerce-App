let products = [];

async function getProducts() {
  const { products: result } = await apiRequest("/products");
  return result;
}

function productCard(product) {
  const id = product._id;
  const name = escapeHTML(product.name);
  const stock = Number(product.stock || 0);
  return `
    <article class="product-card">
      <a class="product-image" href="product-details.html?id=${encodeURIComponent(id)}">
        <img src="${escapeHTML(product.image)}" alt="${name}" loading="lazy">
      </a>
      <p class="product-category">${escapeHTML(product.category)}</p>
      <h3>${name}</h3>
      ${Number(product.rating) > 0 ? `<p class="product-rating">★ ${Number(product.rating).toFixed(1)} <span>(${Number(product.reviews || 0)} reviews)</span></p>` : ""}
      <div class="product-card-bottom">
        <div class="product-price">${money(product.price)}
          ${Number(product.oldPrice) > 0 ? `<span class="old-price">${money(product.oldPrice)}</span>` : ""}
        </div>
      </div>
      <div class="product-actions">
        <a class="details-link" href="product-details.html?id=${encodeURIComponent(id)}">View Details</a>
        <button class="quick-add" data-product-id="${escapeHTML(id)}" aria-label="Add ${name} to cart"
          ${stock < 1 ? "disabled" : ""} title="${stock < 1 ? "Out of stock" : "Add to cart"}">
          ${stock < 1 ? "Out of stock" : '<i class="fa-solid fa-cart-plus"></i>'}
        </button>
      </div>
    </article>`;
}

function displayProducts(list) {
  const container = document.getElementById("productsContainer");
  if (!container) return;
  container.innerHTML = list.length
    ? list.map(productCard).join("")
    : '<div class="no-products"><h2>No products found</h2><p>Try another search or category.</p></div>';
  const count = document.getElementById("resultCount");
  if (count) count.textContent = `Showing ${list.length} of ${products.length} products`;
}

function filterProducts() {
  const search = (document.getElementById("searchInput")?.value || "").trim().toLowerCase();
  const category = (document.getElementById("categoryFilter")?.value || "all").toLowerCase();
  const sort = document.getElementById("sortFilter")?.value || "default";
  const filtered = products.filter((product) => {
    const text = `${product.name} ${product.description} ${product.category}`.toLowerCase();
    return text.includes(search) && (category === "all" || product.category.toLowerCase() === category);
  });
  if (sort === "low-high") filtered.sort((a, b) => Number(a.price) - Number(b.price));
  if (sort === "high-low") filtered.sort((a, b) => Number(b.price) - Number(a.price));
  if (sort === "name") filtered.sort((a, b) => a.name.localeCompare(b.name));
  displayProducts(filtered);
}

async function addProductToCart(id, quantity = 1) {
  const product = products.find((item) => String(item._id) === String(id));
  if (!product) throw new Error("This product is no longer available.");
  if (quantity > Number(product.stock || 0)) throw new Error("There is not enough stock for that quantity.");
  try {
    const { cart } = await apiRequest("/cart/items", {
      method: "POST",
      body: { productId: id, quantity },
    });
    updateCartCount(cart.itemCount);
    return cart;
  } catch (error) {
    if (isSignedOut(error)) {
      location.assign(`login.html?next=${encodeURIComponent("cart.html")}`);
      return null;
    }
    throw error;
  }
}

function installAddToCartHandler(container) {
  if (!container) return;
  container.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-product-id]");
    if (!button || button.disabled) return;
    button.disabled = true;
    try {
      await addProductToCart(button.dataset.productId);
      if (button.isConnected) {
        button.textContent = "Added";
        window.setTimeout(() => {
          if (button.isConnected) {
            button.innerHTML = '<i class="fa-solid fa-cart-plus"></i>';
            button.disabled = false;
          }
        }, 900);
      }
    } catch (error) {
      window.alert(error.message);
      button.disabled = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("productsContainer");
  const featured = document.getElementById("featuredProducts");
  if (!container && !featured) return;
  if (container) container.innerHTML = '<p class="loading-state">Loading products…</p>';
  if (featured) featured.innerHTML = '<p class="loading-state">Loading products…</p>';
  try {
    products = await getProducts();
    const categorySelect = document.getElementById("categoryFilter");
    if (categorySelect) {
      const categories = new Map();
      for (const product of products) {
        const categoryName = product.category.trim();
        const categoryValue = categoryName.toLowerCase();
        if (categoryName && !categories.has(categoryValue)) {
          categories.set(categoryValue, categoryName);
        }
      }
      categorySelect.replaceChildren(new Option("All Categories", "all"));
      for (const [categoryValue, categoryName] of [...categories].sort((a, b) =>
        a[1].localeCompare(b[1]),
      )) {
        const option = document.createElement("option");
        option.value = categoryValue;
        option.textContent = categoryName;
        categorySelect.append(option);
      }
      const requested = new URLSearchParams(location.search).get("category")?.toLowerCase();
      if (requested && [...categorySelect.options].some((option) => option.value === requested)) {
        categorySelect.value = requested;
      }
      categorySelect.addEventListener("change", filterProducts);
    }
    document.getElementById("searchInput")?.addEventListener("input", filterProducts);
    document.getElementById("sortFilter")?.addEventListener("change", filterProducts);
    if (container) {
      installAddToCartHandler(container);
      filterProducts();
    }
    if (featured) {
      featured.innerHTML = products.length
        ? products.slice(0, 4).map(productCard).join("")
        : '<p class="empty-state">No products are available yet.</p>';
      installAddToCartHandler(featured);
    }
  } catch (error) {
    console.error("Product loading failed:", error.message);
    const unavailable = '<div class="no-products"><h2>Products unavailable</h2><p>Could not load products. Check the server connection and try again.</p></div>';
    if (container) container.innerHTML = unavailable;
    if (featured) featured.innerHTML = unavailable;
  }
});
