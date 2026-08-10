import {
  NextRequest,
  NextResponse,
} from 'next/server';

const JOURNAL_REFERENCE =
  /^JE-\d{4}-\d{6}$/;

const DOCUMENT_REFERENCE =
  /^DOC-\d{4}-\d{6}$/;

export function middleware(
  request: NextRequest,
) {
  const reference = String(
    request.nextUrl.searchParams.get(
      'reference',
    ) || '',
  )
    .trim()
    .toUpperCase();

  if (
    request.nextUrl.pathname ===
      '/journals' &&
    JOURNAL_REFERENCE.test(
      reference,
    )
  ) {
    const url =
      request.nextUrl.clone();

    url.pathname =
      `/journals/reference/${reference}`;

    url.searchParams.delete(
      'reference',
    );

    return NextResponse.rewrite(
      url,
    );
  }

  if (
    request.nextUrl.pathname ===
      '/documents' &&
    DOCUMENT_REFERENCE.test(
      reference,
    )
  ) {
    const url =
      request.nextUrl.clone();

    url.pathname =
      `/documents/reference/${reference}`;

    url.searchParams.delete(
      'reference',
    );

    return NextResponse.rewrite(
      url,
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/journals',
    '/documents',
  ],
};
