document.addEventListener("DOMContentLoaded", initializeCheckout);

async function initializeCheckout() {
  const form = document.getElementById("checkoutForm");
  const message = document.getElementById("checkoutMessage");
  const button = document.getElementById("placeOrderButton");
  try {
    const [{ user }, { cart }] = await Promise.all([
      apiRequest("/users/profile"),
      apiRequest("/cart"),
    ]);
    if (!cart.items.length) {
      location.replace("cart.html");
      return;
    }
    document.getElementById("customerName").value = user.name;
    document.getElementById("customerEmail").value = user.email;
    document.getElementById("checkoutItems").innerHTML = cart.items.map(({ product, quantity, lineTotal }) =>
      `<p class="checkout-item"><span>${escapeHTML(product.name)} × ${quantity}</span><strong>${money(lineTotal)}</strong></p>`,
    ).join("");
    document.getElementById("checkoutTotal").textContent = money(cart.total);
  } catch (error) {
    if (isSignedOut(error)) {
      location.replace(`login.html?next=${encodeURIComponent("checkout.html")}`);
      return;
    }
    message.textContent = error.message.includes("Failed to fetch")
      ? "Could not reach NovaStore. Check that the backend is running."
      : error.message;
    message.classList.add("error");
    button.disabled = true;
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.textContent = "";
    message.className = "form-message";
    button.disabled = true;
    try {
      const { order, message: resultMessage } = await apiRequest("/orders", {
        method: "POST",
        body: Object.fromEntries(new FormData(form)),
      });
      updateCartCount(0);
      form.innerHTML = `<div class="order-confirmation"><p class="eyebrow">ORDER PLACED</p>
        <h2>Thank you for your order.</h2><p>${escapeHTML(resultMessage)}</p>
        <p>Order reference: <strong>${escapeHTML(order._id)}</strong></p>
        <p class="sandbox-note prominent">Sandbox only — payment was not processed or collected.</p>
        <a class="primary-btn" href="orders.html">View order history</a></div>`;
    } catch (error) {
      message.textContent = error.message;
      message.classList.add("error");
      button.disabled = false;
    }
  });
}
