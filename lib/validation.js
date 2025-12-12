export const validateAuth = {
  email: (email) => {
    if (!email) return 'Az email cím megadása kötelező';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return 'Érvénytelen email cím formátum';
    return null;
  },
  
  password: (password) => {
    if (!password) return 'A jelszó megadása kötelező';
    if (password.length < 8) return 'A jelszónak legalább 8 karakter hosszúnak kell lennie';
    if (!/[A-Z]/.test(password)) return 'A jelszónak tartalmaznia kell legalább egy nagybetűt';
    if (!/[a-z]/.test(password)) return 'A jelszónak tartalmaznia kell legalább egy kisbetűt';
    if (!/[0-9]/.test(password)) return 'A jelszónak tartalmaznia kell legalább egy számot';
    return null;
  },
  
  passwordMatch: (password, confirmPassword) => {
    if (password !== confirmPassword) return 'A jelszavak nem egyeznek';
    return null;
  }
};