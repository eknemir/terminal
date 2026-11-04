import Foundation
import XCTest
@testable import TerminalApp

/// Engine/Model.swift: the counters shared by sessions and subagents.
final class ModelTests: XCTestCase {

    private func pending(_ n: String, t: Double = 1) -> Pending { Pending(n: n, c: catOf(n), l: "label", t: t) }

    func testPendingDict() {
        let d = pending("Read", t: 42).dict
        XCTAssertEqual(d["n"] as? String, "Read")
        XCTAssertEqual(d["c"] as? String, "read")
        XCTAssertEqual(d["l"] as? String, "label")
        XCTAssertEqual(d["t"] as? Double, 42)
    }

    func testPendingSetGetRemove() {
        let t = Track()
        XCTAssertNil(t.pendingGet("a"))
        t.pendingSet("a", pending("Read"))
        t.pendingSet("b", pending("Bash"))
        XCTAssertEqual(t.pendingGet("a")?.n, "Read")
        // setting an id again replaces it and moves it last
        t.pendingSet("a", pending("Edit"))
        XCTAssertEqual(t.pending.count, 2)
        XCTAssertEqual(t.pending.last?.id, "a")
        XCTAssertEqual(t.pendingGet("a")?.n, "Edit")
        t.pendingRemove("a")
        XCTAssertNil(t.pendingGet("a"))
        XCTAssertEqual(t.pending.count, 1)
        t.pendingRemove("missing")
        XCTAssertEqual(t.pending.count, 1)
    }

    func testAddTokAndTokDict() {
        let t = Track()
        t.addTok(1, 2, 3, 4)
        t.addTok(10, 20, 30, 40)
        let d = t.tokDict
        XCTAssertEqual(d["in"] as? Int, 11)
        XCTAssertEqual(d["out"] as? Int, 22)
        XCTAssertEqual(d["cr"] as? Int, 33)
        XCTAssertEqual(d["cw"] as? Int, 44)
    }

    func testResetCountersKeepsIdentityState() {
        let t = Track()
        t.addTok(1, 1, 1, 1)
        t.cost = 2; t.tools = 3; t.errors = 1; t.web = 1; t.prompts = 4
        t.byCat = ["read": 2]; t.spark = [1: 2]
        t.model = "claude-opus-5"
        t.pendingSet("x", pending("Read"))
        t.resetCounters()
        XCTAssertEqual(t.tokIn + t.tokOut + t.tokCr + t.tokCw, 0)
        XCTAssertEqual(t.cost, 0)
        XCTAssertEqual(t.tools + t.errors + t.web + t.prompts, 0)
        XCTAssertTrue(t.byCat.isEmpty)
        XCTAssertTrue(t.spark.isEmpty)
        XCTAssertEqual(t.model, "claude-opus-5")
        XCTAssertEqual(t.pending.count, 1)
    }

    func testIsLoopNeedsThreeSameSignaturesInARow() {
        let t = Track()
        XCTAssertFalse(t.isLoop)
        t.sig = ["a", "a"]
        XCTAssertFalse(t.isLoop)
        t.sig = ["a", "a", "a"]
        XCTAssertTrue(t.isLoop)
        t.sig = ["a", "a", "a", "b"]
        XCTAssertFalse(t.isLoop)
        t.sig = ["b", "a", "a", "a"]
        XCTAssertTrue(t.isLoop)
    }

    func testSubAgentKeyAndSessionDefaults() {
        let a = SubAgent(sid: "s1", id: "ag")
        XCTAssertEqual(a.key, "s1:ag")
        let s = Session(id: "x")
        XCTAssertEqual(s.id, "x")
        XCTAssertFalse(s.live)
        XCTAssertNil(s.pid)
    }

    func testGlobalsStartWithEveryCategoryAtZero() {
        let g = Globals()
        XCTAssertEqual(Set(g.byCat.keys), Set(CATS))
        XCTAssertTrue(g.byCat.values.allSatisfy { $0 == 0 })
    }

    func testLogEntryTime() {
        XCTAssertEqual(LogEntry(["t": 5.0]).t, 5)
        XCTAssertEqual(LogEntry([:]).t, 0)
    }
}
