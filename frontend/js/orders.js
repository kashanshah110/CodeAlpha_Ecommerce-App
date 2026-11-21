document.addEventListener("DOMContentLoaded", async () => {
  const message = document.getElementById("ordersMessage");
  const container = document.getElementById("ordersList");
  try {
    const { orders } = await apiRequest("/orders");
    message.hidden = true;
    if (!orders.length) {
      container.innerHTML = '<div class="empty-cart"><h2>No orders yet</h2><p>Your placed orders will appear here.</p><a class="primary-btn" href="products.html">Explore Products</a></div>';
      return;
    }
    container.innerHTML = orders.map((order) => `
      <article class="order-card">
        <div class="order-card-heading"><strong>Order ${escapeHTML(order._id)}</strong>
          <span class="status-badge">${escapeHTML(order.status)}</span></div>
        <p>${new Date(order.createdAt).toLocaleString()} · ${money(order.total)}</p>
        ${order.payment?.status === "paid"
          ? `<p class="payment-badge paid">Payment: Paid (recorded manually${order.payment.paidAt ? ` on ${new Date(order.payment.paidAt).toLocaleString()}` : ""}).</p>`
          : '<p class="payment-badge unpaid">Payment: Not paid. Checkout does not collect payment; contact the store before arranging payment.</p>'}
        <ul>${order.items.map((item) => `<li>${escapeHTML(item.name)} × ${item.quantity} · ${money(item.unitPrice)}</li>`).join("")}</ul>
        <div class="order-address"><strong>Delivery to</strong><br>
          ${escapeHTML(order.shippingAddress.address)}, ${escapeHTML(order.shippingAddress.city)},
          ${escapeHTML(order.shippingAddress.postalCode)}, ${escapeHTML(order.shippingAddress.country)}</div>
      </article>
    `).join("");
  } catch (error) {
    if (isSignedOut(error)) {
      location.replace(`login.html?next=${encodeURIComponent("orders.html")}`);
      return;
    }
    message.textContent = error.message;
    message.classList.add("error");
  }
});
