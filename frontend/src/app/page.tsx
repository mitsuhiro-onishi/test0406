"use client";

import { useState } from "react";
import {
  AppBar, Toolbar, Typography, Container, Box,
  Card, CardContent,
} from "@mui/material";
import UploadFlow from "@/components/UploadFlow";
import DocumentList from "@/components/DocumentList";
import { MOCK_EXHIBITION, MOCK_DOCUMENTS, type MockDocument } from "@/lib/mockData";

export default function PortalPage() {
  const [documents, setDocuments] = useState<MockDocument[]>(MOCK_DOCUMENTS);

  const handleUploaded = (newDocs: MockDocument[]) => {
    setDocuments((prev) => [...newDocs, ...prev]);
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {MOCK_EXHIBITION.name} - 出展社ポータル
          </Typography>
          <Typography variant="body2">出展社A株式会社</Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ py: 4 }}>
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Typography variant="h5" gutterBottom>
              書類をアップロード
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              提出する書類のカテゴリを選び、ファイルをアップロードしてください。
              カメラで紙の書類を撮影してアップロードすることもできます。
            </Typography>
            <UploadFlow onUploaded={handleUploaded} />
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h5" gutterBottom>
              提出済み書類
            </Typography>
            <DocumentList documents={documents} />
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
