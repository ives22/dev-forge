export type UrlMode = "encode" | "decode";

export interface UrlOptions {
  mode: UrlMode;
  spacePlus: boolean;
}

export interface QueryParam {
  key: string;
  value: string;
}

export interface UrlResult {
  ok: boolean;
  output: string;
  error?: string;
  inputLength: number;
  outputLength: number;
  params: QueryParam[];
}

export function parseQueryParams(raw: string): QueryParam[] {
  try {
    const url = new URL(raw);
    return Array.from(url.searchParams.entries()).map(([key, value]) => ({ key, value }));
  } catch {
    return [];
  }
}

export function transformUrl(input: string, options: UrlOptions): UrlResult {
  try {
    let output = "";
    if (options.mode === "encode") {
      output = encodeURIComponent(input);
      if (options.spacePlus) output = output.replace(/%20/g, "+");
    } else {
      output = decodeURIComponent(input.replace(/\+/g, " "));
    }
    return {
      ok: true,
      output,
      inputLength: input.length,
      outputLength: output.length,
      params: parseQueryParams(input)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "URL 转换失败";
    return {
      ok: false,
      output: message,
      error: message,
      inputLength: input.length,
      outputLength: message.length,
      params: parseQueryParams(input)
    };
  }
}
