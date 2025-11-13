"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Edit2, Trash2, Loader2, X } from "lucide-react";
import { toast } from "sonner";

interface DictionaryEntry {
  id: string;
  word: string;
  context: string | null;
  createdAt: string;
}

export function DictionaryManager() {
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [word, setWord] = useState("");
  const [context, setContext] = useState("");

  const fetchEntries = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/dictionary");

      if (!response.ok) {
        throw new Error("Failed to fetch dictionary entries");
      }

      const data = await response.json();
      setEntries(data.entries || []);
    } catch (error: any) {
      console.error("Error fetching dictionary:", error);
      toast.error("Failed to load dictionary");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!word.trim()) {
      toast.error("Word is required");
      return;
    }

    setIsSubmitting(true);

    try {
      const url = editingId ? "/api/dictionary" : "/api/dictionary";
      const method = editingId ? "PUT" : "POST";
      const body = editingId
        ? JSON.stringify({ id: editingId, word: word.trim(), context: context.trim() || null })
        : JSON.stringify({ word: word.trim(), context: context.trim() || null });

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save word");
      }

      toast.success(editingId ? "Word updated!" : "Word added to dictionary!");

      // Reset form
      setWord("");
      setContext("");
      setEditingId(null);

      // Refresh list
      await fetchEntries();
    } catch (error: any) {
      console.error("Error saving word:", error);
      toast.error(error.message || "Failed to save word");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (entry: DictionaryEntry) => {
    setWord(entry.word);
    setContext(entry.context || "");
    setEditingId(entry.id);
    // Scroll to form
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setWord("");
    setContext("");
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this word?")) {
      return;
    }

    try {
      const response = await fetch(`/api/dictionary?id=${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete word");
      }

      toast.success("Word deleted");
      await fetchEntries();
    } catch (error: any) {
      console.error("Error deleting word:", error);
      toast.error("Failed to delete word");
    }
  };

  const filteredEntries = entries.filter((entry) =>
    entry.word.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (entry.context && entry.context.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Dictionary</h1>
          <p className="text-muted-foreground">
            Teach the transcription engine how to spell product names, acronyms, or shorthand the way you do.
          </p>
        </div>
        <Badge variant="secondary" className="text-lg px-4 py-2">
          {entries.length} {entries.length === 1 ? "word" : "words"}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How the dictionary is used</CardTitle>
          <CardDescription>
            These entries are injected into every transcription request so the AI can prioritize your preferred spellings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <p className="font-semibold text-primary mb-2">Great examples</p>
              <ul className="space-y-1 list-disc list-inside marker:text-primary">
                <li><span className="font-medium text-foreground">“AcmePay”</span> — <span className="italic">“Our fintech app (pronounced ack-mee-pay)”</span></li>
                <li><span className="font-medium text-foreground">“Dr. Xavier Li”</span> — <span className="italic">“Lead cardiologist”</span></li>
                <li><span className="font-medium text-foreground">“OKR sync”</span> — <span className="italic">“Quarterly planning meeting name”</span></li>
              </ul>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="font-semibold text-foreground mb-2">Tips</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Add phrases, not just single words</li>
                <li>Use the context field to explain pronunciation or meaning</li>
                <li>Keep entries short and specific to your workflow</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center space-x-2">
              <Plus className="h-5 w-5" />
              <span>{editingId ? "Edit Word" : "Add New Word"}</span>
            </span>
            {editingId && (
              <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            )}
          </CardTitle>
          <CardDescription>
            Add specialized terms, names, or phrases that the AI should never miss.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="word">Word or Phrase *</Label>
                <Input
                  id="word"
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                  placeholder="e.g., “AcmePay checkout”, “Project Hadron”"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Enter the exact spelling you expect to see in the transcript.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="context">Context (Optional)</Label>
                <Textarea
                  id="context"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder='e.g., "Our payments product, pronounced ack-mee-pay"'
                  className="min-h-[88px]"
                />
                <p className="text-xs text-muted-foreground">
                  Use this to describe pronunciation, industry, or why it matters. The AI will see this note along with your word.
                </p>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full md:w-auto"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : editingId ? (
                <Edit2 className="mr-2 h-4 w-4" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {editingId ? "Update Word" : "Add to Dictionary"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Dictionary</CardTitle>
          <CardDescription>
            Manage your custom vocabulary list
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {entries.length > 0 && (
              <div className="flex items-center space-x-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search dictionary..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed rounded-lg">
                <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
                  <Search className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">
                  {entries.length === 0 ? "No words yet" : "No results found"}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {entries.length === 0
                    ? "Add your first custom word to improve transcription accuracy"
                    : "Try a different search term"}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start justify-between p-4 border rounded-lg hover:shadow-md transition-shadow"
                  >
                    <div className="flex-1 space-y-1">
                      <div className="font-semibold">{entry.word}</div>
                      {entry.context && (
                        <div className="text-sm text-muted-foreground">
                          {entry.context}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        Added {new Date(entry.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEdit(entry)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(entry.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
