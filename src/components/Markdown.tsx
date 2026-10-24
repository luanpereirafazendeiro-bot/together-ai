import { Fragment, type ReactNode } from "react";

// Renderizador mínimo e SEGURO (só gera elementos React, nunca HTML cru).
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`\n]+`|\*\*[^*\n]+\*\*|https?:\/\/[^\s<]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith("`")) out.push(<code key={key}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("**")) out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else
      out.push(
        <a key={key} href={tok} target="_blank" rel="noopener noreferrer nofollow">
          {tok}
        </a>,
      );
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const parts = text.split(/```/);
  return (
    <>
      {parts.map((part, pi) => {
        if (pi % 2 === 1) {
          const code = part.replace(/^[^\n]*\n/, "");
          return (
            <pre key={pi}>
              <code>{code.replace(/\n$/, "")}</code>
            </pre>
          );
        }
        const lines = part.split("\n");
        const blocks: ReactNode[] = [];
        let list: string[] = [];
        let para: string[] = [];
        const flushPara = () => {
          if (para.length) {
            blocks.push(
              <p key={`p${pi}-${blocks.length}`}>
                {para.map((l, li) => (
                  <Fragment key={li}>
                    {li > 0 && <br />}
                    {inline(l, `i${pi}-${blocks.length}-${li}`)}
                  </Fragment>
                ))}
              </p>,
            );
            para = [];
          }
        };
        const flushList = () => {
          if (list.length) {
            blocks.push(
              <ul key={`u${pi}-${blocks.length}`}>
                {list.map((l, li) => (
                  <li key={li}>{inline(l, `l${pi}-${blocks.length}-${li}`)}</li>
                ))}
              </ul>,
            );
            list = [];
          }
        };
        for (const line of lines) {
          const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
          if (li) {
            flushPara();
            list.push(li[1]);
          } else if (!line.trim()) {
            flushPara();
            flushList();
          } else {
            flushList();
            para.push(line.replace(/^#{1,6}\s+/, ""));
          }
        }
        flushPara();
        flushList();
        return <Fragment key={pi}>{blocks}</Fragment>;
      })}
    </>
  );
}
