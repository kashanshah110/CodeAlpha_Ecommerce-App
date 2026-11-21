document.addEventListener("DOMContentLoaded", renderCart);

async function renderCart() {
  const container = document.getElementById("cartContainer");
  if (!container) return;
  container.innerHTML = '<p class="loading-state">Loading your cart…</p>';
  try {
    const { cart } = await apiRequest("/cart");
    updateCartCount(cart.itemCount);
    if (!cart.items.length) {
      container.innerHTML = `<div class="empty-cart"><i class="fa-solid fa-cart-shopping"></i>
        <h2>Your cart is empty</h2><p>Looks like you haven't added anything yet.</p>
        <a class="primary-btn" href="products.html">Explore Products</a></div>`;
      return;
    }
    container.innerHTML = cart.items.map(({ product, quantity, lineTotal, unavailable }) => `
      <article class="cart-item" data-product-id="${escapeHTML(product.id)}">
        ${unavailable
          ? '<div class="cart-unavailable-thumb">Unavailable</div>'
          : `<img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}">`}
        <div><h3>${escapeHTML(product.name)}</h3>
          ${unavailable
            ? '<p>This product is no longer available. Remove it to continue.</p>'
            : `<p>${money(product.price)} each</p><p>${product.stock} in stock</p>`}</div>
        <div class="quantity-controls">
          <button data-quantity="-1" aria-label="Decrease quantity" ${unavailable ? "disabled" : ""}>−</button>
          <span>${quantity}</span>
          <button data-quantity="1" aria-label="Increase quantity" ${unavailable || quantity >= product.stock ? "disabled" : ""}>+</button>
        </div>
        <div class="cart-line-total"><strong>${money(lineTotal)}</strong>
          <button class="remove-btn" data-remove><i class="fa-solid fa-trash"></i> Remove</button></div>
      </article>
    `).join("") + `<div class="cart-summary"><h2>Order Summary</h2>
      <p><span>Items</span><strong>${cart.itemCount}</strong></p>
      <p><span>Shipping</span><strong>Calculated at checkout</strong></p>
      <p><span>Estimated total</span><strong>${money(cart.total)}</strong></p>
      <p class="sandbox-note">Sandbox checkout does not collect payment.</p>
      <a class="primary-btn checkout-link" href="checkout.html">Proceed to Checkout</a></div>`;

    container.addEventListener("click", handleCartAction, { once: true });
  } catch (error) {
    if (isSignedOut(error)) {
      location.replace(`login.html?next=${encodeURIComponent("cart.html")}`);
      return;
    }
    container.innerHTML = `<div class="no-products"><h2>Cart unavailable</h2><p>${escapeHTML(error.message)}</p></div>`;
  }
}

async function handleCartAction(event) {
  const item = event.target.closest(".cart-item");
  if (!item) return;
  const id = item.dataset.productId;
  try {
    if (event.target.closest("[data-remove]")) {
      await apiRequest(`/cart/items/${encodeURIComponent(id)}`, { method: "DELETE" });
    } else {
      const change = Number(event.target.closest("[data-quantity]")?.dataset.quantity);
      if (!change) return;
      const quantity = Number(item.querySelector(".quantity-controls span").textContent) + change;
      await apiRequest(`/cart/items/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: { quantity },
      });
    }
    await renderCart();
  } catch (error) {
    window.alert(error.message);
    await renderCart();
  }
}
