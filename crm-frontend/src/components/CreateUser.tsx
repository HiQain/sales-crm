import { useState } from "react";
import apiClient from "../api/client";
import { X } from "lucide-react";

type CreateUserModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

const inputClassName =
  "w-full rounded-md border border-slate-400 bg-white px-4 py-3 text-base text-slate-700 outline-none transition focus:border-slate-700 focus:ring-2 focus:ring-indigo-500/15";

export default function CreateUserModal({ open, onClose, onSuccess }: CreateUserModalProps) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleCreate = async () => {
    setLoading(true);
    try {
      await apiClient.post("/auth/register", {
        username,
        email,
        password,
      });

      setUsername("");
      setEmail("");
      setPassword("");
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]">
      <div className="relative w-full max-w-[402px] rounded-3xl bg-white px-6 pb-6 pt-7 shadow-[0_24px_60px_rgba(15,23,42,0.24)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={22} />
        </button>

        <div className="mb-6">
          <h2 className="text-[35px] font-bold tracking-tight text-slate-700 sm:text-[20px]">
            Create User
          </h2>
        </div>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreate();
          }}
        >
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-600">Email</span>
            <input
              className={inputClassName}
              placeholder="test4@example.com"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-600">Name</span>
            <input
              className={inputClassName}
              placeholder="test 4"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-600">Password</span>
            <input
              className={inputClassName}
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-md bg-[linear-gradient(90deg,#4f35e8_0%,#5a3df1_100%)] px-4 py-3 text-base font-medium text-white shadow-lg shadow-indigo-500/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Creating..." : "Create User"}
          </button>
        </form>
      </div>
    </div>
  );
}
