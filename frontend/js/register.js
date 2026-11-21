document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("registerForm");
  if (!form) return;

  const message = document.getElementById("authMessage");
  const button = form.querySelector('button[type="submit"]');
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.textContent = "Creating your account…";
    message.className = "form-message";
    button.disabled = true;
    try {
      await apiRequest("/users/register", {
        method: "POST",
        body: {
          name: form.elements.name.value.trim(),
          email: form.elements.email.value.trim(),
          password: form.elements.password.value,
        },
      });
      message.textContent = "Account created. You can now sign in.";
      message.classList.add("success");
      form.reset();
      window.setTimeout(() => location.assign("login.html"), 1000);
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
