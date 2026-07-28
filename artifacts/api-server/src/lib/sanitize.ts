import DOMPurify from 'dompurify';

/**
 * Sanitize HTML content to prevent XSS attacks
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href'],
    ALLOW_DATA_ATTR: false,
  });
}

/**
 * Sanitize text input by removing potentially dangerous characters
 */
export function sanitizeText(text: string): string {
  return text
    .replace(/[<>]/g, '') // Remove < and >
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, ''); // Remove event handlers like onclick=
}

/**
 * Sanitize user input for chat messages
 */
export function sanitizeChatMessage(message: string): string {
  return sanitizeText(message.trim());
}

/**
 * Validate and sanitize patient name
 */
export function sanitizePatientName(name: string): string {
  return name
    .trim()
    .replace(/[<>]/g, '')
    .substring(0, 100); // Limit length
}
