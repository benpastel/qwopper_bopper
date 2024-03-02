from typing import NamedTuple

import pymunk  # type: ignore

TORSO_SIZE = (164, 254)
CALF_SIZE = (60, 275)
THIGH_SIZE = (60, 142)
ARM_SIZE = (60, 275)

# how many pixels from each edge
# are the anchors / joints?
JOINT_OFFSET = CALF_SIZE[0] // 2

TAKE_DAMAGE_COLLISION_TYPE = 1
DEAL_DAMAGE_COLLISION_TYPE = 2

ELASTICITY = 0.05
FRICTION = 0.9


def _encode_position(body: pymunk.Body) -> dict[str, float]:
    """return position + angle as a dict for sending to client"""
    x, y = body.position
    return {"x": x, "y": y, "angle": body.angle}


def _anchor(size: tuple[int, int], top: bool, left: bool) -> tuple[int, int]:
    """
    Return the joint location in local coordinates
    I.e. the offset from the center of the shape at which we should attach another shape
    """
    w, h = size

    if top:
        y_offset = JOINT_OFFSET - h // 2
    else:
        y_offset = h // 2 - JOINT_OFFSET

    if left:
        x_offset = JOINT_OFFSET - w // 2
    else:
        x_offset = w // 2 - JOINT_OFFSET

    return x_offset, y_offset


class Limb(NamedTuple):
    body: pymunk.Body
    box: pymunk.Poly
    motor: pymunk.SimpleMotor


class Fighter(NamedTuple):
    torso: pymunk.Body
    torso_box: pymunk.Poly

    # limb name (e.g. "rthigh") => Limb
    limbs: dict[str, Limb]

    def position_json(self) -> dict[str, dict[str, float]]:
        """
        Encode position in json for sending to client.
        """
        return {"torso": _encode_position(self.torso)} | {
            name: _encode_position(limb.body) for name, limb in self.limbs.items()
        }

    def take_damage_shapes(self) -> list[pymunk.Shape]:
        """Shapes that take damage if struck by an oppponent."""
        return [self.torso_box]

    def motors(self) -> list[pymunk.SimpleMotor]:
        return [limb.motor for limb in self.limbs.values()]


def add_limb(
    mass,
    moment,
    size: tuple[int, int],
    attach_body: pymunk.Body,
    attach_size: tuple[int, int],
    is_above: bool,
    is_left: bool,
    space: pymunk.Space,
) -> Limb:
    body = pymunk.Body(mass=mass, moment=moment)
    body.angle = 0

    box = pymunk.Poly.create_box(body, size=size)
    box.collision_type = DEAL_DAMAGE_COLLISION_TYPE
    box.elasticity = ELASTICITY
    box.friction = FRICTION

    joint = pymunk.PivotJoint(
        attach_body,
        body,
        _anchor(size=attach_size, top=is_above, left=is_left),
        _anchor(size=size, top=(not is_above), left=is_left),
    )
    if is_above:
        motor = pymunk.DampedRotarySpring(body, attach_body, rest_angle=0, stiffness=10000, damping=1000)
    else:
        motor = pymunk.DampedRotarySpring(attach_body, body, rest_angle=0, stiffness=10000, damping=1000)
    space.add(body, box, joint, motor)
    return Limb(body, box, motor)


def add_fighter(
    space: pymunk.Space, group: int, start_position: tuple[int, int]
) -> Fighter:
    torso = pymunk.Body(mass=100, moment=1000000)
    torso.position = start_position

    torso_box = pymunk.Poly.create_box(torso, size=TORSO_SIZE)
    torso_box.group = group
    torso_box.filter = pymunk.ShapeFilter(group=group)
    torso_box.collision_type = TAKE_DAMAGE_COLLISION_TYPE
    torso_box.elasticity = ELASTICITY
    space.add(torso, torso_box)

    limbs: dict[str, Limb] = {}

    # all limbs have a right and left
    for is_left in [False, True]:
        prefix = "l" if is_left else "r"

        limbs[f"{prefix}arm"] = add_limb(
            mass=5,
            moment=5000,
            size=ARM_SIZE,
            attach_body=torso,
            attach_size=TORSO_SIZE,
            is_above=True,
            is_left=is_left,
            space=space,
        )

        limbs[f"{prefix}thigh"] = thigh = add_limb(
            mass=10,
            moment=50000,
            size=THIGH_SIZE,
            attach_body=torso,
            attach_size=TORSO_SIZE,
            is_above=False,
            is_left=is_left,
            space=space,
        )

        limbs[f"{prefix}calf"] = add_limb(
            mass=5,
            moment=5000,
            size=CALF_SIZE,
            attach_body=thigh.body,
            attach_size=THIGH_SIZE,
            is_above=False,
            is_left=is_left,
            space=space,
        )

    for limb in limbs.values():
        limb.body.position = start_position
        limb.box.group = group
        limb.box.filter = pymunk.ShapeFilter(group=group)

    return Fighter(torso, torso_box, limbs)
