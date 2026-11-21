document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("productDetails");
  if (!container) return;
  const id = new URLSearchParams(location.search).get("id");
  if (!id) {
    container.innerHTML = '<div class="not-found"><h2>Product not found</h2><a class="primary-btn" href="products.html">Back to products</a></div>';
    return;
  }
  container.innerHTML = '<p class="loading-state">Loading product…</p>';
  try {
    const { product } = await apiRequest(`/products/${encodeURIComponent(id)}`);
    products = [product];
    const stock = Number(product.stock || 0);
    container.innerHTML = `<div class="details-container">
      <div class="details-image"><img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}"></div>
      <div class="details-info">
        <p class="details-category">${escapeHTML(product.category)}</p>
        <h1>${escapeHTML(product.name)}</h1>
        ${Number(product.rating) > 0 ? `<p class="details-rating">★ ${Number(product.rating).toFixed(1)} (${Number(product.reviews || 0)} reviews)</p>` : ""}
        <div class="details-price"><span>${money(product.price)}</span>
          ${Number(product.oldPrice) > 0 ? `<del>${money(product.oldPrice)}</del>` : ""}
        </div>
        <p class="details-description">${escapeHTML(product.description)}</p>
        <p class="stock-state">${stock > 0 ? `${stock} in stock` : "Currently out of stock"}</p>
        <div class="quantity-box"><label for="quantity">Quantity:</label>
          <input type="number" id="quantity" value="1" min="1" max="${stock}" step="1" ${stock < 1 ? "disabled" : ""}>
        </div>
        <button class="add-cart-btn" id="addToCartBtn" ${stock < 1 ? "disabled" : ""}>
          <i class="fa-solid fa-cart-plus"></i> Add to Cart
        </button>
        <p id="detailMessage" class="form-message" role="status"></p>
      </div>
    </div>`;
    document.getElementById("addToCartBtn").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const quantity = Number(document.getElementById("quantity").value);
      const message = document.getElementById("detailMessage");
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > stock) {
        message.textContent = `Enter a quantity from 1 to ${stock}.`;
        message.className = "form-message error";
        return;
      }
      button.disabled = true;
      try {
        await addProductToCart(product._id, quantity);
        message.textContent = "Added to your cart.";
        message.className = "form-message success";
      } catch (error) {
        message.textContent = error.message;
        message.className = "form-message error";
      } finally {
        button.disabled = false;
      }
    });
  } catch (error) {
    if (isSignedOut(error)) {
      container.innerHTML = '<div class="not-found"><h2>Product unavailable</h2><p>Please try again shortly.</p><a class="primary-btn" href="products.html">Back to products</a></div>';
      return;
    }
    container.innerHTML = `<div class="not-found"><h2>Could not load this product</h2><p>${escapeHTML(error.message)}</p><a class="primary-btn" href="products.html">Back to products</a></div>`;
  }
});
