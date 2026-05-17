import { Link, useParams, Navigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BLOGS, getBlogBySlug } from "@/lib/blogs";
import { Calendar, Clock, ArrowRight, ArrowLeft, BookOpen } from "lucide-react";
import { useEffect } from "react";

function setMeta(title: string, description: string, canonical: string) {
  document.title = title;
  let m = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
  if (!m) { m = document.createElement('meta'); m.name = 'description'; document.head.appendChild(m); }
  m.content = description;
  let c = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!c) { c = document.createElement('link'); c.rel = 'canonical'; document.head.appendChild(c); }
  c.href = canonical;
}

export function BlogIndex() {
  useEffect(() => {
    setMeta(
      "English Certification Blog — CEFR Tips, Career & Study Guides | TOEFL Academic",
      "Expert articles on CEFR English certification, exam prep, career growth, study abroad and immigration. Free guides updated regularly.",
      window.location.origin + "/blog"
    );
  }, []);

  const ld = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "TOEFL Academic Blog",
    url: window.location.origin + "/blog",
    blogPost: BLOGS.map((b) => ({
      "@type": "BlogPosting",
      headline: b.title,
      datePublished: b.date,
      author: { "@type": "Organization", name: b.author },
      url: window.location.origin + "/blog/" + b.slug,
    })),
  };

  return (
    <Layout>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <section className="bg-gradient-hero text-primary-foreground py-16">
        <div className="container mx-auto text-center max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold/15 border border-gold/30 text-gold text-xs font-medium mb-4">
            <BookOpen className="w-3.5 h-3.5" /> TOEFL Academic Blog
          </div>
          <h1 className="font-serif text-5xl md:text-6xl font-bold mb-4">English Certification Insights</h1>
          <p className="text-primary-foreground/80 text-lg">Guides, tips and strategies to help you certify your English and unlock global opportunities.</p>
        </div>
      </section>

      <section className="container mx-auto py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {BLOGS.map((b) => (
            <Card key={b.slug} className="p-6 flex flex-col hover:shadow-elegant transition-smooth">
              <Badge variant="secondary" className="self-start mb-3">{b.category}</Badge>
              <h2 className="font-serif text-xl font-bold text-primary mb-2 leading-tight">
                <Link to={`/blog/${b.slug}`} className="hover:text-accent transition-smooth">{b.title}</Link>
              </h2>
              <p className="text-sm text-muted-foreground mb-4 flex-1">{b.description}</p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(b.date).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {b.readTime}</span>
              </div>
              <Button asChild variant="outline" size="sm" className="self-start">
                <Link to={`/blog/${b.slug}`}>Read article <ArrowRight className="w-3 h-3 ml-1" /></Link>
              </Button>
            </Card>
          ))}
        </div>
      </section>
    </Layout>
  );
}

export function BlogPost() {
  const { slug } = useParams();
  const post = slug ? getBlogBySlug(slug) : undefined;

  useEffect(() => {
    if (post) {
      setMeta(
        `${post.title} | TOEFL Academic Blog`,
        post.description,
        window.location.origin + "/blog/" + post.slug
      );
    }
  }, [post]);

  if (!post) return <Navigate to="/blog" replace />;

  const ld = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: { "@type": "Organization", name: post.author },
    publisher: { "@type": "Organization", name: "TOEFL Academic" },
    keywords: post.keywords.join(", "),
    mainEntityOfPage: window.location.origin + "/blog/" + post.slug,
  };

  // simple markdown-lite render: ## headings, lists, paragraphs, **bold**
  const blocks = post.content.trim().split(/\n\n+/);
  const renderInline = (text: string) =>
    text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**")
        ? <strong key={i}>{part.slice(2, -2)}</strong>
        : <span key={i}>{part}</span>
    );

  const related = BLOGS.filter((b) => b.slug !== post.slug).slice(0, 3);

  return (
    <Layout>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <article className="container mx-auto py-12 max-w-3xl">
        <Link to="/blog" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-accent mb-6">
          <ArrowLeft className="w-4 h-4" /> All articles
        </Link>
        <Badge variant="secondary" className="mb-4">{post.category}</Badge>
        <h1 className="font-serif text-4xl md:text-5xl font-bold text-primary mb-4 leading-tight">{post.title}</h1>
        <p className="text-lg text-muted-foreground mb-6">{post.description}</p>
        <div className="flex items-center gap-5 text-sm text-muted-foreground border-y border-border py-4 mb-8">
          <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {new Date(post.date).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}</span>
          <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {post.readTime} read</span>
          <span>By {post.author}</span>
        </div>

        <div className="prose-content space-y-5">
          {blocks.map((block, i) => {
            if (block.startsWith("## ")) {
              return <h2 key={i} className="font-serif text-2xl font-bold text-primary mt-8 mb-2">{block.replace(/^##\s+/, "")}</h2>;
            }
            if (block.startsWith("- ")) {
              const items = block.split("\n").map((l) => l.replace(/^-\s+/, ""));
              return (
                <ul key={i} className="list-disc pl-6 space-y-1 text-muted-foreground">
                  {items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}
                </ul>
              );
            }
            return <p key={i} className="text-muted-foreground leading-relaxed">{renderInline(block)}</p>;
          })}
        </div>

        <div className="mt-12 p-6 bg-gradient-subtle border border-border rounded-lg text-center">
          <h3 className="font-serif text-2xl font-bold text-primary mb-2">Ready to certify your English?</h3>
          <p className="text-muted-foreground mb-4">Get a CEFR-aligned, globally verifiable certificate online.</p>
          <Button asChild variant="gold" size="lg"><Link to="/auth?mode=signup">Book your test</Link></Button>
        </div>

        <div className="mt-16">
          <h3 className="font-serif text-2xl font-bold text-primary mb-4">Related articles</h3>
          <div className="grid md:grid-cols-3 gap-4">
            {related.map((r) => (
              <Card key={r.slug} className="p-4">
                <Badge variant="secondary" className="mb-2 text-[10px]">{r.category}</Badge>
                <Link to={`/blog/${r.slug}`} className="font-semibold text-sm text-primary hover:text-accent block mb-1">{r.title}</Link>
                <span className="text-xs text-muted-foreground">{r.readTime}</span>
              </Card>
            ))}
          </div>
        </div>
      </article>
    </Layout>
  );
}
