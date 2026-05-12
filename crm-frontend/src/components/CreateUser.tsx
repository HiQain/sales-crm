import { useState } from "react";
import apiClient from "../api/client";
import { X } from "lucide-react";

export default function CreateUserModal({ open, onClose, onSuccess }) {
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

      onSuccess?.();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-2xl w-[400px] shadow-xl relative">
        
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500"
        >
          <X />
        </button>

        <h2 className="text-xl font-bold mb-4">Create User</h2>

        <input
          className="w-full border p-2 mb-3 rounded"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <input
          className="w-full border p-2 mb-3 rounded"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          className="w-full border p-2 mb-3 rounded"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full bg-indigo-600 text-white py-2 rounded"
        >
          {loading ? "Creating..." : "Create User"}
        </button>
      </div>
    </div>
  );
}