import UnikInfoLayout from "./UnikInfoLayout";

// The seven legal/policy pages linked from the UNIK Labs footer share the
// same shape: a title, a last-updated date and a short "still being
// prepared" notice -- full policy wording isn't ready yet, so this renders
// a clean placeholder rather than inventing legal text.
export default function LegalPlaceholder({ title }: { title: string }) {
  return (
    <UnikInfoLayout kicker="Legal" title={title} lastUpdated="July 2026">
      <div className="ui-notice">
        This page is a placeholder. The full text of our {title.toLowerCase()} is being prepared and
        will be published here before it applies to any order. In the meantime, if you have a
        question, please reach out through the Contact page.
      </div>
    </UnikInfoLayout>
  );
}
