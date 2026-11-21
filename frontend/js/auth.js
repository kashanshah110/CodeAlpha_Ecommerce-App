async function getCurrentUser() {
  const { user } = await apiRequest("/users/profile");
  return user;
}
