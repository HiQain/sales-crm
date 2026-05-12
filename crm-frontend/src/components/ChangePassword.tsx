import React, { useState } from "react";
import apiClient from "../api/client";

interface Props {
  userId: number;
  username: string;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function ChangePasswordModal({
  userId,
  username,
  open,
  onClose,
  onSuccess
}: Props) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!password) return;

    setLoading(true);
    try {
      await apiClient.put(`/users/${userId}/password`, {
        password
      });

      setPassword("");
      onClose();
      onSuccess?.();
    } catch (err) {
      console.error("Password update failed", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white w-96 p-6 rounded-xl shadow-xl">
        
        <h2 className="text-lg font-bold mb-4">
          Change Password
        </h2>

        <p className="text-sm text-slate-500 mb-3">
          User: <span className="font-semibold">{username}</span>
        </p>

        <input
          type="password"
          placeholder="New password"
          className="w-full border p-2 rounded mb-4"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1 border rounded"
          >
            Cancel
          </button>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-3 py-1 bg-indigo-600 text-white rounded"
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </div>

      </div>
    </div>
  );
}