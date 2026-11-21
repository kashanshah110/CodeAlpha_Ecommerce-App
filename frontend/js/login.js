document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  if (!form) return;

  const message = document.getElementById("loginMessage");
  const button = document.getElementById("loginBtn");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.textContent = "Signing in…";
    message.className = "form-message";
    button.disabled = true;
    try {
      await apiRequest("/users/login", {
        method: "POST",
        body: {
          email: form.elements.email.value.trim(),
          password: form.elements.password.value,
        },
      });
      const requestedPage = new URLSearchParams(location.search).get("next");
      const safeNext = ["profile.html", "cart.html", "checkout.html", "orders.html", "admin.html"].includes(requestedPage)
        ? requestedPage
        : "profile.html";
      location.assign(safeNext);
    } catch (error) {
      message.textContent = error.message.includes("Failed to fetch")
        ? "Could not reach NovaStore. Check that the backend is running."
        : error.message;
      message.classList.add("error");
    } finally {
      button.disabled = false;
    }
  });
});
