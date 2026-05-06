import ReactMarkdown from "react-markdown";

/**
 * Sanitized markdown renderer.
 *
 * react-markdown renders only the AST it understands. Raw HTML in the source
 * is *not* rendered unless rehype-raw is wired in (it is not). javascript:
 * URLs are stripped by react-markdown's default URL transformer. The result
 * is XSS-safe for assistant output without us having to maintain an HTML
 * allow-list of our own.
 *
 * If a future requirement needs richer rendering (HTML in markdown, tables,
 * task lists), revisit by adding remark-gfm + rehype-sanitize rather than
 * rehype-raw.
 */
export function Markdown({ source }: { source: string }) {
  return (
    <ReactMarkdown
      components={{
        a: ({ children, href, ...rest }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            {...rest}
          >
            {children}
          </a>
        ),
      }}
    >
      {source ?? ""}
    </ReactMarkdown>
  );
}
