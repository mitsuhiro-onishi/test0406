"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Chip, Typography, IconButton, Box,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import CameraAltIcon from "@mui/icons-material/CameraAlt";

interface Document {
  id: string;
  file_name: string;
  file_type: string;
  file_size_bytes: number;
  submission_category_name: string | null;
  source_channel: string;
  status: string;
  created_at: string;
}

const statusLabels: Record<string, { label: string; color: "default" | "info" | "warning" | "success" | "error" }> = {
  received: { label: "受信済", color: "info" },
  processing: { label: "解析中", color: "warning" },
  analyzed: { label: "解析完了", color: "success" },
  review_needed: { label: "要レビュー", color: "warning" },
  confirmed: { label: "確認済", color: "success" },
  error: { label: "エラー", color: "error" },
};

export default function DocumentList({ exhibitionId }: { exhibitionId: string }) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [total, setTotal] = useState(0);

  const fetchDocuments = useCallback(async () => {
    const res = await fetch(`/api/documents?exhibition_id=${exhibitionId}`);
    const data = await res.json();
    setDocuments(data.data);
    setTotal(data.total);
  }, [exhibitionId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Listen for custom refresh event
  useEffect(() => {
    const handler = () => fetchDocuments();
    window.addEventListener("documents-updated", handler);
    return () => window.removeEventListener("documents-updated", handler);
  }, [fetchDocuments]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("ja-JP", {
      month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
          全{total}件
        </Typography>
        <IconButton onClick={fetchDocuments} size="small">
          <RefreshIcon />
        </IconButton>
      </Box>

      {documents.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 4 }}>
          まだ書類が提出されていません
        </Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ファイル名</TableCell>
                <TableCell>カテゴリ</TableCell>
                <TableCell>サイズ</TableCell>
                <TableCell>状態</TableCell>
                <TableCell>提出日時</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {documents.map((doc) => {
                const st = statusLabels[doc.status] || { label: doc.status, color: "default" as const };
                return (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        {doc.source_channel === "camera_capture"
                          ? <CameraAltIcon fontSize="small" color="action" />
                          : <InsertDriveFileIcon fontSize="small" color="action" />
                        }
                        <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                          {doc.file_name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip label={doc.submission_category_name || "-"} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>{formatFileSize(doc.file_size_bytes)}</TableCell>
                    <TableCell>
                      <Chip label={st.label} size="small" color={st.color} />
                    </TableCell>
                    <TableCell>{formatDate(doc.created_at)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
