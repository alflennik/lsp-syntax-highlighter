import numpy as np
from kmedoids import KMedoids

def my_distance(a, b):
    return abs(a["toast"] - b["toast"])

X = np.array([
    { "toast": 0.1 }, { "toast": 0.2 }, { "toast": 0.15 },
    { "toast": 0.6 }, { "toast": 0.65 }, { "toast": 0.7 },
    { "toast": 0.9 }, { "toast": 0.85 }, { "toast": 0.95 }
])

kmedoids = KMedoids(n_clusters=3, metric=my_distance)

kmedoids.fit(X)

clusters = {}
for label, point in zip(kmedoids.labels_, X):
    clusters.setdefault(label, []).append(point["toast"])

for label, points in clusters.items():
    print(f"Cluster {label}:")
    for p in points:
        print("  ", p)