from typing import NamedTuple

import pymunk  # type: ignore

TORSO_SIZE = (164, 254)
CALF_SIZE = (60, 275)
THIGH_SIZE = (60, 142)

# how many pixels from each edge
# are the anchors / joints?
JOINT_OFFSET = CALF_SIZE[0] // 2

TAKE_DAMAGE_COLLISION_TYPE = 1
DEAL_DAMAGE_COLLISION_TYPE = 2

ELASTICITY = 0.05


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


def _add_joint(
    top_body: pymunk.Body,
    top_size: tuple[int, int],
    bottom_body: pymunk.Body,
    bottom_size: tuple[int, int],
    space: pymunk.Space,
    left: bool,
) -> pymunk.SimpleMotor:
    joint = pymunk.PivotJoint(
        top_body,
        bottom_body,
        _anchor(size=top_size, top=False, left=left),  # top body has bottom anchor
        _anchor(size=bottom_size, top=True, left=left),  # bottom body has top anchor
    )
    motor = pymunk.SimpleMotor(top_body, bottom_body, rate=0)
    space.add(joint, motor)
    return motor


class Fighter(NamedTuple):
    torso: pymunk.Body
    torso_box: pymunk.Poly

    # right thigh
    rthigh: pymunk.Body
    rthigh_box: pymunk.Poly
    rthigh_motor: pymunk.SimpleMotor

    # left thigh
    lthigh: pymunk.Body
    lthigh_box: pymunk.Poly
    lthigh_motor: pymunk.SimpleMotor

    # right calf
    rcalf: pymunk.Body
    rcalf_box: pymunk.Poly
    rcalf_motor: pymunk.SimpleMotor

    # left calf
    lcalf: pymunk.Body
    lcalf_box: pymunk.Poly
    lcalf_motor: pymunk.SimpleMotor

    def position_json(self) -> dict[str, dict[str, float]]:
        """
        Encode position in json for sending to client.
        """
        return {
            "torso": _encode_position(self.torso),
            "rthigh": _encode_position(self.rthigh),
            "lthigh": _encode_position(self.lthigh),
            "rcalf": _encode_position(self.rcalf),
            "lcalf": _encode_position(self.lcalf),
        }

    def take_damage_shapes(self) -> list[pymunk.Shape]:
        """Shapes that take damage if struck by an oppponent."""
        return [self.torso_box]

    def motors(self) -> list[pymunk.SimpleMotor]:
        return [
            self.rthigh_motor,
            self.lthigh_motor,
            self.rcalf_motor,
            self.lcalf_motor,
        ]


def add_fighter(
    space: pymunk.Space, group: int, starting_position: tuple[int, int]
) -> Fighter:

    def _configure_body(body: pymunk.Body) -> None:
        body.position = starting_position
        body.angle = 0
        space.add(body)

    def _configure_shape(
        poly: pymunk.Poly, collision_type: int = DEAL_DAMAGE_COLLISION_TYPE
    ) -> None:
        poly.group = group
        poly.collision_type = collision_type
        poly.elasticity = ELASTICITY
        poly.filter = pymunk.ShapeFilter(group=group)
        space.add(poly)

    torso = pymunk.Body(mass=100, moment=1000000)
    torso_box = pymunk.Poly.create_box(torso, size=TORSO_SIZE)
    _configure_body(torso)
    _configure_shape(torso_box, collision_type=TAKE_DAMAGE_COLLISION_TYPE)

    rcalf = pymunk.Body(mass=5, moment=5000)
    rcalf_box = pymunk.Poly.create_box(rcalf, size=CALF_SIZE)
    _configure_body(rcalf)
    _configure_shape(rcalf_box)

    lcalf = pymunk.Body(mass=5, moment=5000)
    lcalf_box = pymunk.Poly.create_box(lcalf, size=CALF_SIZE)
    _configure_body(lcalf)
    _configure_shape(lcalf_box)

    rthigh = pymunk.Body(mass=10, moment=50000)
    rthigh_box = pymunk.Poly.create_box(rthigh, size=THIGH_SIZE)
    _configure_body(rthigh)
    _configure_shape(rthigh_box)

    lthigh = pymunk.Body(mass=10, moment=50000)
    lthigh_box = pymunk.Poly.create_box(lthigh, size=THIGH_SIZE)
    _configure_body(lthigh)
    _configure_shape(lthigh_box)

    rthigh_motor = _add_joint(torso, TORSO_SIZE, rthigh, THIGH_SIZE, space, left=False)
    lthigh_motor = _add_joint(torso, TORSO_SIZE, lthigh, THIGH_SIZE, space, left=True)
    rcalf_motor = _add_joint(rthigh, THIGH_SIZE, rcalf, CALF_SIZE, space, left=False)
    lcalf_motor = _add_joint(lthigh, THIGH_SIZE, lcalf, CALF_SIZE, space, left=True)

    return Fighter(
        torso,
        torso_box,
        rthigh,
        rthigh_box,
        rthigh_motor,
        lthigh,
        lthigh_box,
        lthigh_motor,
        rcalf,
        rcalf_box,
        rcalf_motor,
        lcalf,
        lcalf_box,
        lcalf_motor,
    )
