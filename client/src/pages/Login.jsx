import { useState } from "react";
import { signInWithPopup, signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import LoginForm from "../components/LoginForm";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleBackendAuth(firebaseUser) {
    const idToken = await firebaseUser.getIdToken();
    const response = await axios.post(
      `${import.meta.env.VITE_API_URL}/api/auth/google`,
      { idToken }
    );
    localStorage.setItem("user", JSON.stringify(response.data));
    navigate("/group");
  }

  async function handleGoogleLogin() {
    setError("");
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await handleBackendAuth(result.user);
    } catch (err) {
      console.error("Google sign-in error code:", err.code);
      console.error("Google sign-in error message:", err.message);
      setError("Google sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      await handleBackendAuth(result.user);
    } catch (err) {
      console.log("Login error code:", err.code)      // ✅ add
      console.log("Login error message:", err.message)
      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("Enter your email above first, then click Forgot Password.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
      setError("");
    } catch (err) {
      setError("Could not send reset email. Check the email address.");
    }
  }

  return (
    <LoginForm
      email={email}
      setEmail={setEmail}
      password={password}
      setPassword={setPassword}
      error={error}
      resetSent={resetSent}
      loading={loading}
      handleEmailLogin={handleEmailLogin}
      handleGoogleLogin={handleGoogleLogin}
      handleForgotPassword={handleForgotPassword}
    />
  );
}

export default Login;