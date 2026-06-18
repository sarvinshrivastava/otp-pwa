import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Receive from "./routes/Receive";

// Receive is the hot path (a push notification opens it), so it loads eagerly.
// The dashboard/onboarding routes — and their heavy QR libraries — are split
// out and fetched only when visited.
const Onboard = lazy(() => import("./routes/Onboard"));
const Dashboard = lazy(() => import("./routes/Dashboard"));
const Login = lazy(() => import("./routes/Login"));

function Fallback() {
  return <p className="p-6 text-center text-neutral-400">Loading…</p>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Fallback />}>
        <Routes>
          <Route path="/" element={<Receive />} />
          <Route path="/onboard" element={<Onboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
