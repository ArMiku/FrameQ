from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class MarkdownChunk:
    id: int
    summary: str
    content: str


class MarkdownSplitter:
    def __init__(self, max_length: int = 2000) -> None:
        self.max_length = max_length

    def split(self, markdown: str) -> list[MarkdownChunk]:
        sections = self._split_by_headings(markdown.strip())
        chunks: list[MarkdownChunk] = []
        for summary, content in sections:
            for part in self._split_long_text(content):
                if part.strip():
                    chunks.append(
                        MarkdownChunk(
                            id=len(chunks) + 1,
                            summary=summary,
                            content=part.strip(),
                        )
                    )
        return chunks

    def _split_by_headings(self, markdown: str) -> list[tuple[str, str]]:
        heading_pattern = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)
        matches = list(heading_pattern.finditer(markdown))
        if not matches:
            return [("内容摘要", markdown)] if markdown else []

        sections: list[tuple[str, str]] = []
        if matches[0].start() > 0:
            front = markdown[: matches[0].start()].strip()
            if front:
                sections.append(("内容摘要", front))

        for index, match in enumerate(matches):
            heading = match.group(2).strip()
            content_start = markdown.find("\n", match.start())
            content_start = content_start + 1 if content_start != -1 else match.end()
            content_end = matches[index + 1].start() if index + 1 < len(matches) else len(markdown)
            content = markdown[content_start:content_end].strip()
            heading_line = markdown[match.start() : content_start].strip()
            sections.append((heading, f"{heading_line}\n{content}".strip()))
        return sections

    def _split_long_text(self, text: str) -> list[str]:
        if len(text) <= self.max_length:
            return [text]

        parts: list[str] = []
        current = text
        while len(current) > self.max_length:
            split_at = current.rfind("\n\n", 0, self.max_length)
            if split_at == -1:
                split_at = current.rfind("。", 0, self.max_length)
            if split_at == -1:
                split_at = self.max_length
            parts.append(current[:split_at].strip())
            current = current[split_at:].strip()
        if current:
            parts.append(current)
        return parts
