"""
Community detection — Louvain / label propagation.

Per design: Louvain/LPA recovers A/B/C on bridge-filtered subgraph.
Bridge-filtered = remove X1-X4 or filter BRIDGES_VIA edges.

Uses Neo4j GDS louvain if available else networkx greedy modularity / label propagation.
"""
import pickle
from pathlib import Path
from typing import Dict, List
from collections import defaultdict, Counter

try:
    import networkx as nx
    from networkx.algorithms.community import greedy_modularity_communities, louvain_communities
    HAS_NX = True
except ImportError:
    HAS_NX = False

from backend.config import PROJECT_ROOT
from backend.graph.neo4j_client import get_driver, is_available
from backend.config import NEO4J_DATABASE

BRIDGE_IDS = {"X1","X2","X3","X4"}

def communities_networkx(filter_bridges: bool = True, graph_serial: Dict = None) -> List[Dict]:
    # Optional per-case serial (investigation scope). Defaults to the global
    # demo graph pickle when omitted — existing callers unaffected.
    if not HAS_NX:
        return []
    node_kind = {}
    person_edges = []
    if graph_serial and graph_serial.get("nodes"):
        for n in graph_serial["nodes"]:
            node_kind[n["id"]] = (n.get("kind"), n.get("cell"))
        person_edges = [(e["src"], e["dst"]) for e in graph_serial.get("edges", [])
                        if e.get("kind") in ("CALLED", "TRANSACTED")]
    else:
        pkl = PROJECT_ROOT / "output" / "graph.pkl"
        if not pkl.exists():
            return []
        with open(pkl, "rb") as f:
            G = pickle.load(f)
        for nid, attrs in G.nodes(data=True):
            node_kind[nid] = (attrs.get("kind"), attrs.get("cell"))
        for u, v, data in G.edges(data=True):
            if data.get("kind") not in ("CALLED", "TRANSACTED"):
                continue
            person_edges.append((u, v))
    H = nx.Graph()
    for u, v in person_edges:
        if node_kind.get(u, (None, None))[0] != "Person" or node_kind.get(v, (None, None))[0] != "Person":
            continue
        if filter_bridges and (u in BRIDGE_IDS or v in BRIDGE_IDS):
            continue
        H.add_edge(u, v)
    if len(H.nodes) == 0:
        return []
    # Try louvain, fallback greedy
    try:
        comms = louvain_communities(H, seed=42)
    except:
        comms = list(greedy_modularity_communities(H))
    res = []
    for idx, comm in enumerate(comms):
        comm = list(comm)
        # majority cell
        cells = [node_kind.get(n, (None, "Unknown"))[1] for n in comm]
        cnt = Counter(cells)
        dominant, _ = cnt.most_common(1)[0] if cnt else ("Unknown",0)
        res.append({"community_id": idx, "members": comm, "size": len(comm), "dominant_cell": dominant, "cell_breakdown": dict(cnt)})
    res.sort(key=lambda x: x["size"], reverse=True)
    return res

def communities_neo4j(filter_bridges: bool = True) -> List[Dict]:
    drv = get_driver()
    if not drv:
        return []
    try:
        with drv.session(database=NEO4J_DATABASE) as session:
            # check GDS
            try:
                session.run("CALL gds.version()").consume()
            except:
                return []
            try:
                session.run("CALL gds.graph.drop('fusion_comm', false)").consume()
            except:
                pass
            # project without bridges if filtering
            if filter_bridges:
                session.run("""
                CALL gds.graph.project.cypher('fusion_comm',
                  'MATCH (p:Person) WHERE NOT p.id IN ["X1","X2","X3","X4"] RETURN id(p) AS id',
                  'MATCH (a:Person)-[r:CALLED|TRANSACTED]-(b:Person) WHERE NOT a.id IN ["X1","X2","X3","X4"] AND NOT b.id IN ["X1","X2","X3","X4"] RETURN id(a) AS source, id(b) AS target'
                )
                """).consume()
            else:
                session.run("CALL gds.graph.project('fusion_comm', 'Person', {CALLED:{orientation:'UNDIRECTED'}, TRANSACTED:{orientation:'UNDIRECTED'}})").consume()
            # try louvain
            try:
                result = session.run("CALL gds.louvain.stream('fusion_comm') YIELD nodeId, communityId RETURN gds.util.asNode(nodeId).id AS id, communityId")
                mapping = defaultdict(list)
                for r in result:
                    mapping[r["communityId"]].append(r["id"])
                res = []
                for cid, members in mapping.items():
                    res.append({"community_id": cid, "members": members, "size": len(members)})
                session.run("CALL gds.graph.drop('fusion_comm')").consume()
                return res
            except Exception as e:
                # fallback label propagation
                result = session.run("CALL gds.labelPropagation.stream('fusion_comm') YIELD nodeId, communityId RETURN gds.util.asNode(nodeId).id AS id, communityId")
                mapping = defaultdict(list)
                for r in result:
                    mapping[r["communityId"]].append(r["id"])
                res = [{"community_id": cid, "members": members, "size": len(members)} for cid, members in mapping.items()]
                session.run("CALL gds.graph.drop('fusion_comm')").consume()
                return res
    except Exception as e:
        print(f"[community] neo4j error {e}")
        return []

def detect_communities(filter_bridges: bool = True, graph_serial: Dict = None) -> List[Dict]:
    # Per-case serial bypasses Neo4j (global-only) and runs on the given graph.
    if graph_serial is not None:
        return communities_networkx(filter_bridges, graph_serial)
    if is_available():
        rows = communities_neo4j(filter_bridges)
        if rows:
            return rows
    return communities_networkx(filter_bridges)
