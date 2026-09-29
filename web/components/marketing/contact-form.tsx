"use client";
import { useActionState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { sendContactInquiry } from "@/lib/actions/contact";
import { CONTACT_TOPICS } from "@/lib/domain/contact";

export function ContactForm() {
  const [state, action, pending] = useActionState(sendContactInquiry, {
    success: false,
    message: "",
  });
  return (
    <form className="m-contact-form" action={action}>
      <h2>How can we help?</h2>
      {state.message && (
        <p
          className="m-form-message"
          data-success={state.success}
          role={state.success ? "status" : "alert"}
        >
          {state.message}
        </p>
      )}
      <div className="m-field-row">
        <div className="m-field">
          <label htmlFor="contact-name">Your name *</label>
          <input
            id="contact-name"
            name="name"
            required
            minLength={2}
            maxLength={100}
            autoComplete="name"
          />
        </div>
        <div className="m-field">
          <label htmlFor="contact-email">Email address *</label>
          <input
            id="contact-email"
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
          />
        </div>
      </div>
      <div className="m-field-row">
        <div className="m-field">
          <label htmlFor="contact-phone">Phone number</label>
          <input id="contact-phone" name="phone" type="tel" maxLength={30} autoComplete="tel" />
        </div>
        <div className="m-field">
          <label htmlFor="contact-topic">What do you need? *</label>
          <select name="topic" id="contact-topic" required>
            {CONTACT_TOPICS.map((topic) => (
              <option key={topic}>{topic}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="m-field">
        <label htmlFor="contact-message">Tell us about your vehicle or module *</label>
        <textarea
          id="contact-message"
          name="message"
          rows={5}
          required
          minLength={20}
          maxLength={3000}
          placeholder="Include the make, model, year, and what you’d like help with."
        />
      </div>
      <div className="m-honeypot" aria-hidden="true">
        <label htmlFor="contact-website">Leave this field empty</label>
        <input id="contact-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <button type="submit" className="m-button" disabled={pending}>
        {pending ? (
          <>
            <LoaderCircle size={17} className="animate-spin" />
            Sending…
          </>
        ) : (
          <>
            Send Message
            <ArrowRight size={17} />
          </>
        )}
      </button>
      <p>
        We’ll use these details to respond to your inquiry. Please don’t include payment details.
      </p>
    </form>
  );
}
