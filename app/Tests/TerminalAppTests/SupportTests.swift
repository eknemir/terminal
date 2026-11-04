import Foundation
import XCTest
@testable import TerminalApp

/// Engine/Support.swift: pricing, tool categories, value and text helpers, time parsing.
final class SupportTests: XCTestCase {

    // MARK: pricing

    func testPriceForMatchesLongestListedPrefixFirst() {
        XCTAssertEqual(priceFor("claude-opus-5-5-20261101")?.input, 4)
        XCTAssertEqual(priceFor("claude-opus-5-20260101")?.input, 5)
        XCTAssertEqual(priceFor("claude-sonnet-4-5")?.output, 15)
        XCTAssertEqual(priceFor("claude-haiku-5-5")?.longAt, 100_000)
        XCTAssertNil(priceFor(nil))
        XCTAssertNil(priceFor(""))
        XCTAssertNil(priceFor("gpt-5"))
    }

    func testContextLimitIsZeroForUnknownModels() {
        XCTAssertEqual(contextLimit("gpt-5", cwd: ""), 0)
        XCTAssertEqual(contextLimit(nil, cwd: ""), 0)
    }

    func testCostOfInputOutputAndCacheRead() {
        let m = "claude-sonnet-4"
        XCTAssertEqual(costOf(m, ["input_tokens": 1_000_000]), 3, accuracy: 1e-9)
        XCTAssertEqual(costOf(m, ["output_tokens": 1_000_000]), 15, accuracy: 1e-9)
        XCTAssertEqual(costOf(m, ["cache_read_input_tokens": 1_000_000]), 0.3, accuracy: 1e-9)
        XCTAssertEqual(costOf(m, ["input_tokens": NSNumber(value: 500_000)]), 1.5, accuracy: 1e-9)
    }

    func testCostOfCacheWritesSplitBetween5mAnd1h() {
        let u: [String: Any] = [
            "cache_creation_input_tokens": 1_000_000,
            "cache_creation": ["ephemeral_1h_input_tokens": 400_000],
        ]
        // 600k at 1.25x input, 400k at 2x input (input $3/M)
        XCTAssertEqual(costOf("claude-sonnet-4", u), 0.6 * 3 * 1.25 + 0.4 * 3 * 2, accuracy: 1e-9)
    }

    func testCostOfFastModeDoublesAndUnknownModelIsFree() {
        XCTAssertEqual(costOf("claude-sonnet-4", ["input_tokens": 1_000_000, "speed": "fast"]), 6, accuracy: 1e-9)
        XCTAssertEqual(costOf("claude-sonnet-4", ["input_tokens": 1_000_000, "speed": "standard"]), 3, accuracy: 1e-9)
        XCTAssertEqual(costOf("nope", ["input_tokens": 1_000_000]), 0)
        XCTAssertEqual(costOf(nil, [:]), 0)
    }

    func testCostOfLongContextPricing() {
        let m = "claude-haiku-5-5"
        // under the threshold: base price
        XCTAssertEqual(costOf(m, ["input_tokens": 100_000]), 0.1 * 0.1, accuracy: 1e-12)
        // over it (input + cache counted together): long price for everything
        XCTAssertEqual(costOf(m, ["input_tokens": 60_000, "cache_read_input_tokens": 60_000]),
                       (60_000 * 0.5 + 60_000 * 0.05) / 1e6, accuracy: 1e-12)
    }

    func testSavedOf() {
        XCTAssertEqual(savedOf("claude-sonnet-4", ["cache_read_input_tokens": 1_000_000]), 2.7, accuracy: 1e-9)
        XCTAssertEqual(savedOf("nope", ["cache_read_input_tokens": 1_000_000]), 0)
    }

    func testShortModel() {
        XCTAssertEqual(shortModel("claude-opus-4-5-20251101"), "opus 4.5")
        XCTAssertEqual(shortModel("claude-sonnet-4"), "sonnet 4")
        XCTAssertEqual(shortModel("claude-sonnet-4-20250514"), "sonnet 4")
        XCTAssertEqual(shortModel("gpt-5"), "gpt 5")
        XCTAssertEqual(shortModel("weird_name"), "weird_name")
        XCTAssertEqual(shortModel(""), "")
        XCTAssertEqual(shortModel(nil), "")
    }

    // MARK: categories

    func testCatOf() {
        XCTAssertEqual(catOf("Read"), "read")
        XCTAssertEqual(catOf("WebFetch"), "web")
        XCTAssertEqual(catOf("Grep"), "search")
        XCTAssertEqual(catOf("MultiEdit"), "edit")
        XCTAssertEqual(catOf("PowerShell"), "bash")
        XCTAssertEqual(catOf("Task"), "agent")
        XCTAssertEqual(catOf("mcp__claude-in-chrome__navigate"), "browser")
        XCTAssertEqual(catOf("mcp__computer-use__screenshot"), "browser")
        XCTAssertEqual(catOf("computer"), "browser")
        XCTAssertEqual(catOf("mcp__github__list"), "mcp")
        XCTAssertEqual(catOf("TodoWrite"), "plan")
        for name in ["Read", "Bash", "mcp__x__y", "Whatever"] {
            XCTAssertTrue(CATS.contains(catOf(name)), name)
        }
    }

    // MARK: values and text

    func testIntAndStr() {
        XCTAssertEqual(int(3), 3)
        XCTAssertEqual(int(NSNumber(value: 3.9)), 3)
        XCTAssertEqual(int("7"), 0)
        XCTAssertEqual(int(nil), 0)
        XCTAssertEqual(str("a"), "a")
        XCTAssertNil(str(1))
        XCTAssertNil(str(nil))
    }

    func testClipCollapsesWhitespaceAndTruncates() {
        XCTAssertEqual(clip("a  b\n\tc", 10), "a b c")
        XCTAssertEqual(clip("abcdef", 4), "abc…")
        XCTAssertEqual(clip("abcd", 4), "abcd")
        XCTAssertEqual(clip("", 4), "")
        XCTAssertEqual(clip(nil, 4), "")
    }

    func testRedactKnownTokenShapes() {
        XCTAssertEqual(redact("key sk-ant-abcdefghijklmnop end"), "key ‹•••› end")
        XCTAssertEqual(redact("ghp_" + String(repeating: "a", count: 24)), "‹•••›")
        XCTAssertEqual(redact("AKIAABCDEFGHIJKLMNOP"), "‹•••›")
        XCTAssertEqual(redact(String(repeating: "deadbeef", count: 4)), "‹•••›")
        XCTAssertFalse(redact("eyJhbGciOiJI.eyJzdWIiOiIx.abcdEFGH").contains("eyJ"))
    }

    func testRedactKeyValueSecretsButKeepsVariables() {
        XCTAssertEqual(redact("password=hunter2xyz"), "password=‹•••›")
        XCTAssertEqual(redact("API_KEY: abcdef123"), "API_KEY: ‹•••›")
        XCTAssertEqual(redact("token: $TOKEN_VAR"), "token: $TOKEN_VAR")
        XCTAssertEqual(redact("pass=abc"), "pass=abc") // too short to be a secret
    }

    func testRedactLongMixedTokensOnly() {
        let mixed = "Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56Qr"
        XCTAssertEqual(redact("x \(mixed) y"), "x ‹•••› y")
        let plain = String(repeating: "abcdefgh", count: 5) // no digits or capitals: a word, not a token
        XCTAssertEqual(redact(plain), plain)
        XCTAssertEqual(redact("ls -la /tmp"), "ls -la /tmp")
        XCTAssertEqual(redact(nil), "")
        XCTAssertEqual(redact(""), "")
    }

    func testHostPathAndHostOf() {
        XCTAssertEqual(hostPath("https://www.example.com/a/b"), "example.com/a/b")
        XCTAssertEqual(hostPath("https://example.com/"), "example.com")
        XCTAssertEqual(hostPath("https://example.com"), "example.com")
        XCTAssertEqual(hostPath("not a url"), "not a url")
        XCTAssertEqual(hostPath(nil), "")
        XCTAssertEqual(hostOf("https://www.x.org/p"), "x.org")
        XCTAssertEqual(hostOf("https://api.x.org"), "api.x.org")
        XCTAssertEqual(hostOf("nope"), "")
        XCTAssertEqual(hostOf(nil), "")
    }

    func testPathLabels() {
        XCTAssertEqual(shortPath("/a/b/c/d.swift"), "c/d.swift")
        XCTAssertEqual(shortPath("d.swift"), "d.swift")
        XCTAssertEqual(shortPath(nil), "")
        XCTAssertEqual(tildify(HOME + "/code"), "~/code")
        XCTAssertEqual(tildify("/opt/x"), "/opt/x")
        XCTAssertEqual(tildify(""), "")
        XCTAssertEqual(cwdLabel("/a/b/c/d/e/f"), "/a/…/e/f")
        XCTAssertEqual(cwdLabel("/a/b/c"), "/a/b/c")
        XCTAssertEqual(projectLabel("/a/b/c"), "b/c")
        XCTAssertEqual(projectLabel(nil), "")
    }

    func testFmtBytes() {
        XCTAssertEqual(fmtBytes(0), "0B")
        XCTAssertEqual(fmtBytes(1023), "1023B")
        XCTAssertEqual(fmtBytes(2048), "2KB")
        XCTAssertEqual(fmtBytes(3 << 19), "1.5MB")
    }

    // MARK: summarize

    func testSummarizeFileTools() {
        let r = summarize("Read", ["file_path": "/x/y/z.txt"])
        XCTAssertEqual(r.label, "y/z.txt")
        XCTAssertEqual(r.file, "/x/y/z.txt")
        XCTAssertNil(r.cmd)
        XCTAssertEqual(summarize("NotebookEdit", ["notebook_path": "/n/b.ipynb"]).file, "/n/b.ipynb")
    }

    func testSummarizeBashRedactsAndKeepsCommand() {
        let r = summarize("Bash", ["command": "curl -H 'token: abcdef123456' x", "description": "Fetch"])
        XCTAssertEqual(r.label, "Fetch")
        XCTAssertNotNil(r.cmd)
        XCTAssertFalse(r.cmd!.contains("abcdef123456"))
        XCTAssertEqual(summarize("Bash", ["command": "ls"]).label, "ls")
    }

    func testSummarizeOtherTools() {
        XCTAssertEqual(summarize("Grep", ["pattern": "foo", "path": "/a/b/c"]).label, "/foo/ b/c")
        XCTAssertEqual(summarize("Glob", ["pattern": "**/*.js"]).label, "**/*.js")
        XCTAssertEqual(summarize("WebFetch", ["url": "https://www.a.com/x"]).label, "a.com/x")
        XCTAssertEqual(summarize("TodoWrite", ["todos": [1, 2, 3]]).label, "3 todos")
        XCTAssertEqual(summarize("TodoWrite", [:]).label, "0 todos")
        XCTAssertEqual(summarize("Agent", ["subagent_type": "Explore"]).label, "Explore")
        XCTAssertEqual(summarize("Task", [:]).label, "agent")
        XCTAssertEqual(summarize("Workflow", ["scriptPath": "/p/run.js"]).label, "run.js")
        XCTAssertEqual(summarize("Workflow", [:]).label, "workflow")
        XCTAssertEqual(summarize("SendMessage", ["to": "bob"]).label, "→ bob")
        XCTAssertEqual(summarize("AskUserQuestion", ["questions": [["question": "Which?"]]]).label, "Which?")
        XCTAssertEqual(summarize("Skill", ["skill": "pdf"]).label, "pdf")
        XCTAssertEqual(summarize("Unknown", nil).label, "")
    }

    func testSummarizeMcpTools() {
        XCTAssertEqual(summarize("mcp__claude_ai_Gmail__search", ["query": "hi"]).label, "Gmail.search hi")
        XCTAssertEqual(summarize("mcp__srv__a__b", ["actions": [1, 2]]).label, "srv.a__b ×2")
        XCTAssertEqual(summarize("mcp__srv__nav", ["url": "https://x.com/p"]).label, "srv.nav x.com/p")
        XCTAssertEqual(summarize("mcp__srv__do", ["action": "click"]).label, "srv.do click")
        XCTAssertEqual(summarize("mcp__srv__ping", [:]).label, "srv.ping")
    }

    // MARK: time

    func testParseISO() {
        XCTAssertEqual(parseISO("1970-01-01T00:00:00Z"), 0)
        XCTAssertEqual(parseISO("1970-01-01T00:00:01.5Z"), 1500, accuracy: 1e-6)
        XCTAssertEqual(parseISO("1970-01-01T00:00:01.123456Z"), 1123.456, accuracy: 1e-6)
        let f = ISO8601DateFormatter()
        let expected = f.date(from: "2026-10-24T19:41:07Z")!.timeIntervalSince1970 * 1000 + 123
        XCTAssertEqual(parseISO("2026-10-24T19:41:07.123Z"), expected, accuracy: 1e-6)
        XCTAssertEqual(parseISO("2026-10-24"), 0)
        XCTAssertEqual(parseISO(nil), 0)
    }

    func testNowMsAndDayStart() {
        let now = nowMs()
        XCTAssertEqual(now, Date().timeIntervalSince1970 * 1000, accuracy: 1000)
        XCTAssertLessThanOrEqual(dayStart(), now)
        XCTAssertGreaterThan(dayStart(), now - 86_400_000 - 3_600_000)
    }

    func testOrNull() {
        XCTAssertTrue(orNull(nil) is NSNull)
        XCTAssertEqual(orNull(5) as? Int, 5)
    }
}
