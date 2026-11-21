document.addEventListener("DOMContentLoaded", async () => {
  const message = document.getElementById("profileMessage");
  const card = document.getElementById("profileCard");
  const passwordForm = document.getElementById("changePasswordForm");
  const passwordMessage = document.getElementById("passwordMessage");
  try {
    const { user } = await apiRequest("/users/profile");
    document.getElementById("profileName").textContent = user.name;
    document.getElementById("profileEmail").textContent = user.email;
    document.getElementById("profileRole").textContent = user.role === "admin" ? "Administrator" : "Customer";
    document.getElementById("profileAvatar").textContent = user.name.trim().charAt(0).toUpperCase();
    document.getElementById("profileJoined").textContent = user.createdAt
      ? new Date(user.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
      : "—";
    message.hidden = true;
    card.hidden = false;
    await loadOrderHistory();
  } catch (error) {
    if (isSignedOut(error)) {
      location.replace(`login.html?next=${encodeURIComponent("profile.html")}`);
      return;
    }
    message.textContent = error.message.includes("Failed to fetch")
      ? "Could not reach NovaStore. Check that the backend is running."
      : error.message;
    message.classList.add("error");
  }

  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = passwordForm.querySelector('button[type="submit"]');
    const formData = new FormData(passwordForm);
    const currentPassword = formData.get("currentPassword");
    const newPassword = formData.get("newPassword");
    const confirmPassword = formData.get("confirmPassword");
    passwordMessage.className = "form-message";

    if (newPassword !== confirmPassword) {
      passwordMessage.textContent = "The new passwords do not match.";
      passwordMessage.classList.add("error");
      return;
    }

    submitButton.disabled = true;
    try {
      const { message: resultMessage } = await apiRequest("/users/change-password", {
        method: "POST",
        body: { currentPassword, newPassword },
      });
      passwordForm.reset();
      passwordMessage.textContent = resultMessage;
      passwordMessage.classList.add("success");
    } catch (error) {
      passwordMessage.textContent = error.status === 404
        ? "Password changes are unavailable on the running server. Restart NovaStore from the backend folder, then reload this page."
        : error.message;
      passwordMessage.classList.add("error");
    } finally {
      submitButton.disabled = false;
    }
  });

  document.getElementById("logoutButton").addEventListener("click", async () => {
    const button = document.getElementById("logoutButton");
    button.disabled = true;
    try {
      await apiRequest("/users/logout", { method: "POST" });
      location.replace("login.html");
    } catch (error) {
      button.disabled = false;
      message.hidden = false;
      message.textContent = error.message;
      message.classList.add("error");
    }
  });
});

async function loadOrderHistory() {
  const container = document.getElementById("orderHistory");
  if (!container) return;
  try {
    const { orders } = await apiRequest("/orders");
    if (!orders.length) {
      container.innerHTML = '<p class="empty-state">You have not placed any orders yet.</p>';
      return;
    }
    container.innerHTML = orders.map((order) => `
      <article class="order-card">
        <div class="order-card-heading">
          <strong>Order ${escapeHTML(order._id)}</strong>
          <span class="status-badge">${escapeHTML(order.status)}</span>
        </div>
        <p>${new Date(order.createdAt).toLocaleString()} · ${order.items.length} item(s) · ${money(order.total)}</p>
        ${order.payment?.status === "paid"
          ? `<p class="payment-badge paid">Payment: Paid (recorded manually${order.payment.paidAt ? ` on ${new Date(order.payment.paidAt).toLocaleString()}` : ""}).</p>`
          : '<p class="payment-badge unpaid">Payment: Not paid. Checkout does not collect payment; contact the store before arranging payment.</p>'}
        <ul>${order.items.map((item) => `<li>${escapeHTML(item.name)} × ${item.quantity} · ${money(item.unitPrice)}</li>`).join("")}</ul>
      </article>
    `).join("");
  } catch (error) {
    container.innerHTML = `<p class="form-message error">${escapeHTML(error.message)}</p>`;
  }
}
