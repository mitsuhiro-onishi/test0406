"use client";

import { useEffect, useState } from "react";
import {
  AppBar, Toolbar, Typography, Container, Box, Button,
  Card, CardContent, Alert,
} from "@mui/material";
import UploadFlow from "@/components/UploadFlow";
import DocumentList from "@/components/DocumentList";

export default function PortalPage() {
  const [exhibitionId, setExhibitionId] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize: seed test data and get exhibition
  useEffect(() => {
    const init = async () => {
      try {
        // Check if exhibitions exist
        const res = await fetch("/api/exhibitions");
        const exhibitions = await res.json();
        if (exhibitions.length > 0) {
          setExhibitionId(exhibitions[0].id);
          setSeeded(true);
          return;
        }
        // Seed test data
        const seedRes = await fetch("/api/seed", { method: "POST" });
        const seedData = await seedRes.json();
        setExhibitionId(seedData.exhibition_id);
        setSeeded(true);
      } catch (e) {
        setError("APIサーバーに接続できません。バックエンドが起動しているか確認してください。");
      }
    };
    init();
  }, []);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            第15回 国際産業展示会 - 出展社ポータル
          </Typography>
          <Typography variant="body2">出展社A株式会社</Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ py: 4 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>
        )}

        {!seeded && !error && (
          <Alert severity="info" sx={{ mb: 3 }}>初期化中...</Alert>
        )}

        {seeded && exhibitionId && (
          <>
            <Card sx={{ mb: 4 }}>
              <CardContent>
                <Typography variant="h5" gutterBottom>
                  書類をアップロード
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  提出する書類のカテゴリを選び、ファイルをアップロードしてください。
                  カメラで紙の書類を撮影してアップロードすることもできます。
                </Typography>
                <UploadFlow exhibitionId={exhibitionId} />
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h5" gutterBottom>
                  提出済み書類
                </Typography>
                <DocumentList exhibitionId={exhibitionId} />
              </CardContent>
            </Card>
          </>
        )}
      </Container>
    </Box>
  );
}
