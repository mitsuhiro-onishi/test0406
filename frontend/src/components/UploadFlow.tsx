"use client";

import { useState, useRef } from "react";
import {
  Stepper, Step, StepLabel, Button, Box, Typography,
  Radio, RadioGroup, FormControlLabel, FormControl, FormLabel,
  Chip, IconButton, Alert, Paper,
} from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import { MOCK_CATEGORIES, type MockDocument } from "@/lib/mockData";

const steps = ["ファイル選択", "提出カテゴリ選択", "確認・送信"];

export default function UploadFlow({ onUploaded }: { onUploaded: (docs: MockDocument[]) => void }) {
  const [activeStep, setActiveStep] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const categories = MOCK_CATEGORIES;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
      setError(null);
    }
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleNext = () => {
    if (activeStep === 0 && files.length === 0) {
      setError("ファイルを選択してください");
      return;
    }
    if (activeStep === 1 && !selectedCategory) {
      setError("提出カテゴリを選択してください");
      return;
    }
    setError(null);
    setActiveStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setError(null);
    setActiveStep((prev) => prev - 1);
  };

  const handleUpload = () => {
    // モック: アップロード成功をシミュレート
    const cat = categories.find((c) => c.id === selectedCategory);
    const newDocs: MockDocument[] = files.map((file, i) => ({
      id: `doc-new-${Date.now()}-${i}`,
      file_name: file.name,
      file_type: file.type || "application/octet-stream",
      file_size_bytes: file.size,
      submission_category_name: cat?.name || "",
      source_channel: file.type.startsWith("image/") ? "camera_capture" : "web_upload",
      status: "received",
      created_at: new Date().toISOString(),
    }));

    onUploaded(newDocs);
    setUploadResult(`${files.length}件のファイルをアップロードしました`);
    setFiles([]);
    setSelectedCategory("");
    setActiveStep(0);
  };

  const selectedCategoryObj = categories.find((c) => c.id === selectedCategory);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Box>
      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {uploadResult && (
        <Alert
          severity="success"
          icon={<CheckCircleIcon />}
          onClose={() => setUploadResult(null)}
          sx={{ mb: 2 }}
        >
          {uploadResult}
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      {/* Step 1: File Selection */}
      {activeStep === 0 && (
        <Box>
          <Paper
            variant="outlined"
            sx={{
              p: 4, textAlign: "center", bgcolor: "#fafafa",
              border: "2px dashed #ccc", borderRadius: 2,
              cursor: "pointer",
              "&:hover": { bgcolor: "#f0f0f0", borderColor: "#999" },
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <CloudUploadIcon sx={{ fontSize: 48, color: "text.secondary", mb: 1 }} />
            <Typography variant="body1" gutterBottom>
              ここをクリックしてファイルを選択
            </Typography>
            <Typography variant="body2" color="text.secondary">
              対応形式: Excel (.xlsx), Word (.docx), PDF, 画像 (JPG/PNG/HEIC)
            </Typography>
            <Typography variant="body2" color="text.secondary">
              最大サイズ: 50MB / ファイル
            </Typography>
          </Paper>

          <Box sx={{ display: "flex", gap: 2, mt: 2, justifyContent: "center" }}>
            <Button
              variant="outlined"
              startIcon={<CloudUploadIcon />}
              onClick={() => fileInputRef.current?.click()}
            >
              ファイルを選択
            </Button>
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<CameraAltIcon />}
              onClick={() => cameraInputRef.current?.click()}
            >
              カメラで撮影
            </Button>
          </Box>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".xlsx,.xls,.docx,.doc,.pdf,.jpg,.jpeg,.png,.heic,.heif"
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />

          {files.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                選択済みファイル ({files.length}件)
              </Typography>
              {files.map((file, i) => (
                <Box
                  key={i}
                  sx={{
                    display: "flex", alignItems: "center", gap: 1,
                    p: 1, mb: 0.5, bgcolor: "#f5f5f5", borderRadius: 1,
                  }}
                >
                  <InsertDriveFileIcon color="action" />
                  <Typography variant="body2" sx={{ flexGrow: 1 }}>
                    {file.name}
                  </Typography>
                  <Chip label={formatFileSize(file.size)} size="small" />
                  <IconButton size="small" onClick={() => handleRemoveFile(i)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )}

      {/* Step 2: Category Selection */}
      {activeStep === 1 && (
        <Box>
          <FormControl component="fieldset" fullWidth>
            <FormLabel component="legend" sx={{ mb: 2 }}>
              この書類の提出カテゴリを選択してください
            </FormLabel>
            <RadioGroup
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setError(null);
              }}
            >
              {categories.map((cat) => (
                <Paper key={cat.id} variant="outlined" sx={{ mb: 1, p: 1 }}>
                  <FormControlLabel
                    value={cat.id}
                    control={<Radio />}
                    label={
                      <Box>
                        <Typography variant="body1">
                          {cat.name}
                          {cat.is_required && (
                            <Chip label="必須" size="small" color="error" sx={{ ml: 1 }} />
                          )}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          受取: {cat.recipient_org_name} ― {cat.description}
                        </Typography>
                      </Box>
                    }
                    sx={{ m: 0, width: "100%", py: 0.5 }}
                  />
                </Paper>
              ))}
            </RadioGroup>
          </FormControl>
        </Box>
      )}

      {/* Step 3: Confirm & Submit */}
      {activeStep === 2 && (
        <Box>
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography variant="subtitle1" gutterBottom fontWeight="bold">
              送信内容の確認
            </Typography>

            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary">ファイル</Typography>
              {files.map((file, i) => (
                <Typography key={i} variant="body1">
                  {file.name} ({formatFileSize(file.size)})
                </Typography>
              ))}
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary">提出カテゴリ</Typography>
              <Typography variant="body1">
                {selectedCategoryObj?.name}（受取: {selectedCategoryObj?.recipient_org_name}）
              </Typography>
            </Box>
          </Paper>
        </Box>
      )}

      {/* Navigation */}
      <Box sx={{ display: "flex", justifyContent: "space-between", mt: 3 }}>
        <Button
          disabled={activeStep === 0}
          onClick={handleBack}
        >
          戻る
        </Button>
        {activeStep < 2 ? (
          <Button variant="contained" onClick={handleNext}>
            次へ
          </Button>
        ) : (
          <Button
            variant="contained"
            color="primary"
            onClick={handleUpload}
            startIcon={<CloudUploadIcon />}
          >
            送信する
          </Button>
        )}
      </Box>
    </Box>
  );
}
