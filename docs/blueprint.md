# **App Name**: ChronoRent

## Core Features:

- Device Browsing & Rental Details: Public display of available TimeWaver devices, including types, detailed descriptions, module specifications, dynamic pricing tables based on rental duration, and current availability status. Users can view these details without authentication.
- User Authentication & Profile Management: Secure user registration and login using Firebase Authentication. Authenticated users can manage their personal details, company information, contact numbers, and invoice settings in their profile.
- Guided Rental Application Process: Authenticated users can submit new rental applications, select rental periods (3, 6, 12 months), choose payment methods (monthly or full), and securely upload identification documents for verification. Users can also apply for renewals or join waitlists for unavailable devices.
- Secure FirstPay Payment Integration: A robust payment gateway integration with FirstPay API handling credit card tokenization, 3DS authentication for security, and processing of both one-time and recurring rental payments, ensuring sensitive card data is never stored on the server.
- Personalized User Dashboard: A dedicated dashboard for authenticated users to view the status of their rental applications, track their currently rented TimeWaver devices with their contract periods, and access a comprehensive history of their payments.
- AI-Powered Support Assistant: An interactive chatbot interface utilizing a generative AI tool to answer common user queries regarding platform operation, rental procedures, payment inquiries, and basic troubleshooting or information about TimeWaver devices.
- Comprehensive Admin Control Panel: An administrative interface for managing device inventory (add, edit, update status), reviewing and approving/rejecting rental applications, creating and managing payment links for approved applications, and overseeing overall platform settings.

## Style Guidelines:

- Color Scheme: A light color scheme promoting clarity, trust, and professionalism, reflecting the medical and advanced technology nature of TimeWaver devices.
- Primary Color: A calm and sophisticated blue, providing a sense of reliability and modernity. (HEX: #3996C8, HSL: 200, 55%, 50%)
- Background Color: A very subtle, almost white blue derived from the primary hue, ensuring content remains clear and easy on the eyes. (HEX: #ECF5F8, HSL: 200, 15%, 95%)
- Accent Color: A refreshing turquoise-cyan, analogous to the primary blue, used for calls to action and to highlight interactive elements, suggesting innovation and healing. (HEX: #2EAFAE, HSL: 170, 70%, 45%)
- Headline Font: 'Space Grotesk' (sans-serif) for its modern, slightly technical and clean appearance, suitable for headings and emphasizing key information.
- Body Font: 'Inter' (sans-serif) for highly legible and neutral body text, ensuring readability across all textual content, from device descriptions to admin logs.
- Utilize a consistent set of clean, minimalist line icons to maintain a modern aesthetic and enhance navigation and comprehension across all interface elements.
- Employ a responsive, mobile-first layout based on shadcn/ui and Tailwind CSS, ensuring optimal usability and visual integrity across all device sizes. Admin pages will feature flexible list and card view toggles.
- Implement subtle and purposeful animations for page transitions, data loading indicators, and form submissions to provide visual feedback and a smooth user experience.